import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { recordCreatorCheckoutPayment, recordCreatorInvoicePayment, recordCreatorPaymentReversal } from '@/lib/creator/attribution'
import { sendPaymentActivationEmailForCheckoutSession } from './activation-email'
import { grantEntitlementFromCheckoutSession, revokePaymentIntentEntitlement, updateSubscriptionEntitlement } from './entitlements'
import { getStripe } from './stripe'
import { processBillingWebhook } from './billing-ledger'
import { recordStripeBillingEvent } from './stripe-lifecycle'
import { recordBackendRequest } from '@/lib/reliability/monitor'

// Webhook delivery and recovery share the same verified, idempotent processing path.
export async function processStripeEvent(event: Stripe.Event) {
  await recordStripeBillingEvent(event)
  const legacy = await db.query.stripeWebhookEvents.findFirst({ where: eq(schema.stripeWebhookEvents.id, event.id) })
  if (!legacy) await processBillingWebhook('stripe', event.id, async () => { await handleStripeEvent(event) })
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.async_payment_succeeded':
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const expanded = await getStripe().checkout.sessions.retrieve(session.id, {
        expand: ['subscription', 'customer'],
      })
      if (isLegacyCheckoutProduct(expanded.metadata?.product)) return
      if (!['paid', 'no_payment_required'].includes(expanded.payment_status)) return
      await grantEntitlementFromCheckoutSession({ session: expanded })
      await recordCreatorCheckoutPayment(expanded)
      await sendPaymentActivationEmailForCheckoutSession({ session: expanded }).catch(async (error) => {
        console.error('Payment activation email failed', expanded.id, error)
        await recordBackendRequest('payments/activation-email', { outcome: 'failed', code: 'billing_email_failed', alert: true }, 0)
      })
      return
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const subscriptionId = readInvoiceSubscriptionId(invoice)
      if (!subscriptionId) return
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
      await updateSubscriptionEntitlement(subscription)
      await recordCreatorInvoicePayment(invoice, subscription)
      return
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      await updateSubscriptionEntitlement(await getStripe().subscriptions.retrieve(subscription.id))
      return
    }

    case 'charge.refunded':
      await handleChargeRevocation(event.data.object as Stripe.Charge, 'refunded')
      return

    case 'charge.dispute.created':
      await handleChargeRevocation((event.data.object as Stripe.Dispute).charge, 'disputed')
      return

    default:
      return
  }
}

function isLegacyCheckoutProduct(product: string | null | undefined) {
  return product === 'analysis' || product === 'mobile_subscription'
}

async function handleChargeRevocation(charge: string | Stripe.Charge | null, status: 'refunded' | 'disputed') {
  const chargeObject = typeof charge === 'string' ? await getStripe().charges.retrieve(charge) : charge
  const paymentIntentId = readPaymentIntentId(chargeObject?.payment_intent)
  if (!paymentIntentId) return

  await revokePaymentIntentEntitlement({ paymentIntentId, status })
  await recordCreatorPaymentReversal({
    eventId: chargeObject?.id || paymentIntentId,
    paymentIntentId,
    eventType: status === 'refunded' ? 'refund' : 'dispute',
    amountCents: chargeObject?.amount_refunded || chargeObject?.amount || 0,
    currency: chargeObject?.currency || 'usd',
  })
}

function readPaymentIntentId(paymentIntent: string | Stripe.PaymentIntent | null | undefined) {
  if (!paymentIntent) return null
  return typeof paymentIntent === 'string' ? paymentIntent : paymentIntent.id
}

function readInvoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription
    ?? (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}

