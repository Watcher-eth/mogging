import { getStripe } from './stripe'
import { processStripeEvent } from './stripe-events'
import { processBillingWebhook } from './billing-ledger'
import { recordBackendRequest } from '@/lib/reliability/monitor'
import { db, schema } from '@/lib/db'

const eventTypes = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired',
  'invoice.paid', 'invoice.payment_failed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'payment_intent.payment_failed', 'refund.created', 'refund.updated', 'charge.refunded', 'charge.dispute.created',
] as const

export async function reconcileStripeBilling(now = new Date()) {
  const started = Date.now()
  let recovered = 0
  const ran = await processBillingWebhook('stripe_reconciliation', String(Math.floor(now.getTime() / 300_000)), async () => {
    const stripe = getStripe()
    let webhookReady: boolean | null = null
    try {
      const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
      webhookReady = endpoints.data.some(endpoint => {
      const url = new URL(endpoint.url)
      return endpoint.status === 'enabled' && ['mogging.com','www.mogging.com'].includes(url.hostname)
        && url.pathname === '/api/payments/stripe-webhook'
        && (endpoint.enabled_events.includes('*') || eventTypes.every(type => endpoint.enabled_events.includes(type)))
      })
    } catch {
      await recordBackendRequest('payments/stripe-webhook', { outcome: 'degraded', code: 'billing_webhook_check_failed', alert: true }, Date.now() - started)
    }
    // Overlap covers delayed provider delivery. Receipt and transaction keys make repeats safe.
    for await (const event of stripe.events.list({ created: { gte: Math.floor(now.getTime() / 1000) - 7 * 86400 }, limit: 100, types: [...eventTypes] })) {
      if (Date.now() - started > 80_000) throw new Error('Stripe reconciliation exceeded its processing budget')
      await processStripeEvent(event)
      recovered++
    }
    await db.insert(schema.analyticsEvents).values({
      eventId: crypto.randomUUID(), eventName: 'backend_billing_reconciliation', platform: 'server', source: 'backend',
      environment: process.env.VERCEL_ENV || 'production', occurredAt: now, exportedAt: now,
      properties: { provider: 'stripe', events_checked: recovered, webhook_ready: webhookReady, lookback_days: 7 },
    })
    if (webhookReady === false) await recordBackendRequest('payments/stripe-webhook', { outcome: 'degraded', code: 'billing_webhook_configuration', alert: true }, Date.now() - started)
  })
  return { ran, eventsChecked: recovered }
}
