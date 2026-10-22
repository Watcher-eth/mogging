import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

function harness(options: { checkpoint?: Date; audit?: Date; fail?: boolean } = {}) {
  const now = new Date('2026-10-22T01:00:00Z')
  const requests: any[] = [], checkpoints: any[] = [], events: string[] = []
  let reads = 0
  const scope: any = { Date, URL, crypto, process: { env: { VERCEL_ENV: 'production' } },
    and: (...v: unknown[]) => v, eq: (...v: unknown[]) => v, lt: (...v: unknown[]) => v, desc: (v: unknown) => v, sql: () => ({}),
    schema: { analyticsEvents: {} },
    db: { query: { analyticsEvents: { findFirst: async () => {
      const at = reads++ === 0 ? options.checkpoint : options.audit
      return at ? { occurredAt: at } : null
    } } }, insert: () => ({ values: async (row: any) => { checkpoints.push(row) } }) },
    processBillingWebhook: async (_provider: string, _id: string, work: () => Promise<void>) => { await work(); return true },
    recordBackendRequest: async () => {},
    processStripeEvent: async (e: any) => { if (options.fail) throw Error('retryable provider failure'); events.push(e.id) },
    getStripe: () => ({ webhookEndpoints: { list: async () => ({ data: [{ url: 'https://www.mogging.com/api/payments/stripe-webhook', status: 'enabled', enabled_events: ['*'] }] }) },
      events: { list: async function* (query: any) { requests.push(query); yield { id: 'verified-event' } } } }),
  }
  const source = readFileSync(new URL('./stripe-reconciliation.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/^export /gm, '')
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source + '\nglobalThis.run = reconcileStripeBilling;'), scope)
  return { now, run: () => scope.run(now), requests, checkpoints, events }
}

test('regular recovery scans the last checkpoint plus overlap instead of replaying seven days', async () => {
  const h = harness({ checkpoint: new Date('2026-10-22T00:55:00Z'), audit: new Date('2026-10-21T10:00:00Z') })
  await h.run()
  expect(h.requests[0].created).toEqual({ gte: Date.parse('2026-10-21T23:55:00Z') / 1000, lt: +h.now / 1000 })
  expect(h.events).toEqual(['verified-event'])
  expect(h.checkpoints[0].properties.lookback_days).toBeNull()
})

test('first run and daily audits retain the full seven-day recovery window', async () => {
  for (const options of [{}, { checkpoint: new Date('2026-10-22T00:55:00Z'), audit: new Date('2026-10-20T10:00:00Z') }]) {
    const h = harness(options); await h.run()
    expect(h.requests[0].created.gte).toBe(+h.now / 1000 - 7 * 86400)
    expect(h.checkpoints[0].properties.lookback_days).toBe(7)
  }
})

test('a failed event never advances the recovery checkpoint', async () => {
  const h = harness({ fail: true })
  await expect(h.run()).rejects.toThrow('retryable provider failure')
  expect(h.checkpoints).toEqual([])
})
