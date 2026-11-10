import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { createHash } from 'node:crypto'
import { runStripeRecovery } from './stripe-recovery'

const transpile = (file: string, exports: string, scope: any) => {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + `\nglobalThis.api={${exports}}`), scope)
  return scope.api
}

test('webhook, delayed success and verified return share one financial row and one checkout completion', async () => {
  const ledger = new Map<string, any>(), events = new Map<string, any>()
  const scope: any = { createHash, Date,
    landingProperties: () => ({}), parseLandingAssignment: () => null,
    and: (...values: unknown[]) => values, or: (...values: unknown[]) => values, eq: (...values: unknown[]) => values,
    schema: { users: {}, paymentEntitlements: {}, subscriptionEvents: { table: 'billing' }, analyticsEvents: { table: 'analytics' } },
    db: {
      query: {
        users: { findFirst: async () => ({ id: 'buyer' }) }, paymentEntitlements: { findFirst: async () => ({ userId: 'buyer' }) },
        subscriptionEvents: { findFirst: async () => null }, analyticsEvents: { findFirst: async () => events.values().next().value },
      },
      insert: (table: any) => ({ values: (value: any) => ({ onConflictDoNothing: async () => {
        const map = table.table === 'billing' ? ledger : events
        const key = table.table === 'billing' ? value.providerEventId : value.eventId
        if (!map.has(key)) map.set(key, value)
      } }) }),
    },
  }
  const api = transpile('./stripe-lifecycle.ts', 'recordStripeBillingEvent,recordVerifiedStripeCheckout', scope)
  const session = { id: 'cs_live_paid', mode: 'payment', payment_status: 'paid', amount_total: 999, currency: 'usd', livemode: true, metadata: { accountId: 'buyer', product: 'evaluation' }, payment_intent: 'pi_paid' }
  const event = { id: 'evt_paid', type: 'checkout.session.completed', created: 1000, livemode: true, data: { object: session } }
  await api.recordStripeBillingEvent(event)
  await api.recordVerifiedStripeCheckout(session)
  await api.recordStripeBillingEvent({ ...event, id: 'evt_delayed', type: 'checkout.session.async_payment_succeeded' })
  expect(ledger.size).toBe(1)
  expect([...ledger.values()][0]).toMatchObject({ amount: '9.99', environment: 'production', accountId: 'buyer', productId: 'evaluation' })
  expect(events.size).toBe(1)
  expect([...events.values()][0]).toMatchObject({ eventName: 'checkout_completed', environment: 'production', accountId: 'buyer', sessionId: 'cs_live_paid' })
  expect([...events.values()][0].properties.price).toBe(999)
})

test('webhook inspection failure does not prevent durable billing recovery', async () => {
  let processed = 0
  const done = new Set<string>(), warnings: string[] = [], records: any[] = []
  const chain = { from: () => ({ where: async () => [...done].map(id => ({ id: `stripe:${id}` })) }) }
  const scope: any = { Date, URL, crypto, runStripeRecovery,
    process: { env: { VERCEL_ENV: 'production' } }, schema: { analyticsEvents: {}, billingWebhookReceipts: {} },
    and: (...v: unknown[]) => v, eq: (...v: unknown[]) => v, lt: (...v: unknown[]) => v, desc: (v: unknown) => v,
    inArray: (...v: unknown[]) => v, isNotNull: (v: unknown) => v, sql: (parts: string[]) => ({ text: parts.join('?') }),
    db: { execute: async (query: any) => query.text.includes('insert into billing_reconciliation_state') ? [{ state: null }]
      : query.text.includes('set state=') ? [{ provider: 'stripe' }] : [],
      select: () => chain, query: { analyticsEvents: { findFirst: async () => null } },
      insert: () => ({ values: async (record: any) => { records.push(record) } }) },
    recordBackendRequest: async (_feature: unknown, result: any) => { warnings.push(result.code) },
    processStripeEvent: async (event: any) => { processed++; done.add(event.id) },
    getStripe: () => ({ webhookEndpoints: { list: async () => { throw new Error('Read permission unavailable') } },
      events: { list: async () => ({ data: [{ id: 'verified-provider-event' }], has_more: false }) } }),
  }
  const api = transpile('./stripe-reconciliation.ts', 'reconcileStripeBilling', scope)
  expect(await api.reconcileStripeBilling()).toMatchObject({ ran: true, eventsChecked: 2, recovered: 1, partial: false })
  expect(processed).toBe(1)
  expect(warnings).toEqual(['billing_webhook_check_failed'])
  expect(records[0].properties.webhook_ready).toBeNull()
})
