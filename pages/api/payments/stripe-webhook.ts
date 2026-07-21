import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import {
  recordCreatorCheckoutPayment,
  recordCreatorInvoicePayment,
  recordCreatorPaymentReversal,
} from '@/lib/creator/attribution'
import { sendPaymentActivationEmailForCheckoutSession } from '@/lib/payments/activation-email'
import { grantEntitlementFromCheckoutSession, revokePaymentIntentEntitlement, updateSubscriptionEntitlement } from '@/lib/payments/entitlements'
import { getStripe } from '@/lib/payments/stripe'
import { recordServerEvent } from '@/lib/analytics/events'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } })
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: { code: 'internal_error', message: 'Stripe webhook is not configured' } })
  }

  let event: Stripe.Event
  try {
    const signature = req.headers['stripe-signature']
    const body = await readRawBody(req)
    event = getStripe().webhooks.constructEvent(
      body,
      Array.isArray(signature) ? signature[0] : signature ?? '',
      env.STRIPE_WEBHOOK_SECRET
    )
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error)
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid Stripe webhook signature' } })
  }

  const [reservation] = await db
    .insert(schema.stripeWebhookEvents)
    .values({
      id: event.id,
      type: event.type,
    })
    .onConflictDoNothing({
      target: schema.stripeWebhookEvents.id,
    })
    .returning({ id: schema.stripeWebhookEvents.id })

  if (!reservation) {
    return res.status(200).json({ received: true, duplicate: true })
  }

  try {
    await handleStripeEvent(event)
  } catch (error) {
    console.error('Stripe webhook handling failed', event.id, event.type, error)
    await db.delete(schema.stripeWebhookEvents).where(eq(schema.stripeWebhookEvents.id, event.id))
    return res.status(500).json({ error: { code: 'internal_error', message: 'Webhook handling failed' } })
  }

  return res.status(200).json({ received: true })
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const expanded = await getStripe().checkout.sessions.retrieve(session.id, {
        expand: ['subscription', 'customer'],
      })
      if (isLegacyCheckoutProduct(expanded.metadata?.product)) return
      await grantEntitlementFromCheckoutSession({ session: expanded })
      await recordServerEvent({
        eventName: 'checkout_completed',
        accountId: expanded.metadata?.accountId || expanded.metadata?.userId,
        sessionId: expanded.id,
        source: 'stripe_webhook',
        properties: {
          product: expanded.metadata?.product || 'unknown',
          mode: expanded.mode || 'unknown',
        },
      })
      await recordCreatorCheckoutPayment(expanded)
      await sendPaymentActivationEmailForCheckoutSession({ session: expanded }).catch((error) => {
        console.error('Payment activation email failed', expanded.id, error)
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
      await updateSubscriptionEntitlement(subscription)
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
  const subscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription
  if (!subscription) return null
  return typeof subscription === 'string' ? subscription : subscription.id
}

async function readRawBody(req: NextApiRequest) {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}
