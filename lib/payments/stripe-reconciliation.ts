import { getStripe } from './stripe'
import { processStripeEvent } from './stripe-events'
import { recordBackendRequest } from '@/lib/reliability/monitor'
import { db, schema } from '@/lib/db'
import { and, desc, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { runStripeRecovery, type StripeRecoveryState } from './stripe-recovery'

const eventTypes = [
  'checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired',
  'invoice.paid', 'invoice.payment_failed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'payment_intent.payment_failed', 'refund.created', 'refund.updated', 'charge.refunded', 'charge.dispute.created',
] as const

export async function reconcileStripeBilling(now = new Date()) {
  const started = Date.now(), lease = crypto.randomUUID()
  // One lease across cron invocations, including five-minute boundaries. State
  // survives crashes; an expired lease can be reclaimed without skipping work.
  const claimed = await db.execute(sql`insert into billing_reconciliation_state(provider,lease_id,lease_until)
    values('stripe',${lease},now()+interval '2 minutes') on conflict(provider) do update
    set lease_id=excluded.lease_id,lease_until=excluded.lease_until
    where billing_reconciliation_state.lease_until is null or billing_reconciliation_state.lease_until<now()
    returning state`)
  if (!claimed.length) return { ran: false, busy: true, eventsChecked: 0 }
  try {
    const stripe = getStripe()
    let state = claimed[0].state as StripeRecoveryState | null
    if (!state) {
      const checkpoint = await db.query.analyticsEvents.findFirst({
        where: and(eq(schema.analyticsEvents.eventName, 'backend_billing_reconciliation'),
          eq(schema.analyticsEvents.environment, process.env.VERCEL_ENV || 'production'),
          sql`${schema.analyticsEvents.properties}->>'provider' = 'stripe'`, lt(schema.analyticsEvents.occurredAt, now)),
        orderBy: desc(schema.analyticsEvents.occurredAt), columns: { occurredAt: true },
      })
      state = { incremental: null, audit: null, coveredUntil: checkpoint ? Math.floor(+checkpoint.occurredAt / 1000) : null, auditedAt: null }
    }
    const previousAudit = state.auditedAt
    const result = await runStripeRecovery({ state, now: Math.floor(+now / 1000),
      list: pass => stripe.events.list({ created: { gte: pass.since, lt: pass.until }, limit: 100, types: [...eventTypes],
        ...(pass.cursor ? { starting_after: pass.cursor } : {}) }),
      processed: async ids => new Set(ids.length ? (await db.select({ id: schema.billingWebhookReceipts.id }).from(schema.billingWebhookReceipts)
        .where(and(inArray(schema.billingWebhookReceipts.id, ids.map(id => `stripe:${id}`)), isNotNull(schema.billingWebhookReceipts.processedAt))))
        .map(row => row.id.slice('stripe:'.length)) : []),
      process: processStripeEvent,
      save: async progress => {
        const saved = await db.execute(sql`update billing_reconciliation_state set state=${JSON.stringify(progress)}::jsonb,updated_at=now()
          where provider='stripe' and lease_id=${lease} and lease_until>now() returning provider`)
        if (!saved.length) throw new Error('Stripe reconciliation lease expired')
      },
    })
    let webhookReady: boolean | null = null
    if (state.auditedAt !== previousAudit) {
      try {
        const endpoints = await stripe.webhookEndpoints.list({ limit: 100 })
        webhookReady = endpoints.data.some(endpoint => {
          try {
            const url = new URL(endpoint.url)
            return endpoint.status === 'enabled' && ['mogging.com','www.mogging.com'].includes(url.hostname)
              && url.pathname === '/api/payments/stripe-webhook'
              && (endpoint.enabled_events.includes('*') || eventTypes.every(type => endpoint.enabled_events.includes(type)))
          } catch { return false }
        })
        if (!webhookReady) await recordBackendRequest('payments/stripe-webhook', { outcome: 'degraded', code: 'billing_webhook_configuration', alert: true }, Date.now() - started)
      } catch {
        await recordBackendRequest('payments/stripe-webhook', { outcome: 'degraded', code: 'billing_webhook_check_failed', alert: true }, Date.now() - started)
      }
    }
    await db.insert(schema.analyticsEvents).values({
      eventId: crypto.randomUUID(), eventName: result.partial ? 'backend_billing_reconciliation_progress' : 'backend_billing_reconciliation', platform: 'server', source: 'backend',
      environment: process.env.VERCEL_ENV || 'production', occurredAt: now, exportedAt: now,
      properties: { provider: 'stripe', events_checked: result.checked, events_recovered: result.recovered, webhook_ready: webhookReady,
        partial: result.partial, covered_until: state.coveredUntil, audit_covered_until: state.auditedAt },
    })
    return { ran: true, eventsChecked: result.checked, recovered: result.recovered, partial: result.partial }
  } catch (error) {
    await recordBackendRequest('payments/stripe-recovery-pass', { outcome: 'failed', code: 'billing_reconciliation_failed', alert: true }, Date.now() - started)
    throw error
  } finally {
    await db.execute(sql`update billing_reconciliation_state set lease_id=null,lease_until=null where provider='stripe' and lease_id=${lease}`)
  }
}
