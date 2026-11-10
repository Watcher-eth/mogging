import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { sendPostHogBatch, toPostHogEvent } from '@/lib/analytics/posthog'
export const config = { maxDuration: 60 }

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  if (!process.env.POSTHOG_PROJECT_KEY) return res.status(200).json({ enabled: false })
  const progress = { product: 0, billing: 0 }
  // Each stream advances only after its own batch is accepted. Stable event IDs
  // make overlapping invocations and ambiguous network retries safe downstream.
  const streams = await Promise.allSettled([
    exportProductEvents(count => { progress.product += count }),
    exportBillingEvents(count => { progress.billing += count }),
  ])
  const failedStreams = (['product', 'billing'] as const).filter((_, index) => streams[index].status === 'rejected')
  for (const stream of failedStreams) console.error('Analytics export failed', { stream })
  const exported = progress.product + progress.billing
  return res.status(failedStreams.length ? 502 : 200).json({
    enabled: true, exported, productExported: progress.product, billingExported: progress.billing,
    ...(failedStreams.length ? { error: 'export_failed', failedStreams } : {}),
  })
}

async function exportProductEvents(advance: (count: number) => void) {
  const started = Date.now()
  for (let page = 0; page < 10 && Date.now() - started < 35_000; page++) {
    const events = await db.select().from(schema.analyticsEvents)
      .where(and(isNull(schema.analyticsEvents.exportedAt), eq(schema.analyticsEvents.environment, 'production')))
      .orderBy(asc(schema.analyticsEvents.receivedAt), asc(schema.analyticsEvents.eventId)).limit(200)
    if (!events.length) break
    const sent = await sendPostHogBatch(events.map(event => toPostHogEvent({ ...event, eventId: event.eventId })))
    if (!sent) throw new Error('Product event export unavailable')
    await db.update(schema.analyticsEvents).set({ exportedAt: new Date() }).where(inArray(schema.analyticsEvents.eventId, events.map(event => event.eventId)))
    advance(events.length)
  }
}

async function exportBillingEvents(advance: (count: number) => void) {
  const billing = await db.select().from(schema.subscriptionEvents)
    .where(and(isNull(schema.subscriptionEvents.exportedAt), eq(schema.subscriptionEvents.environment, 'production')))
    .orderBy(asc(schema.subscriptionEvents.receivedAt), asc(schema.subscriptionEvents.id)).limit(200)
  if (!billing.length) return
  const sent = await sendPostHogBatch(billing.map(event => {
    const result = toPostHogEvent({ ...event, eventId: event.id, anonymousId: event.externalUserId ? `${event.provider}:${event.externalUserId}` : null, platform: 'server' })
    // Verified billing is the sole revenue owner. Amount is in currency units.
    Object.assign(result.properties, { billing_provider: event.provider, product_id: event.productId,
      billing_amount: event.amount == null ? null : Number(event.amount), billing_currency: event.currency, billing_event_id: event.providerEventId,
      mobile_install_id: event.properties.mobile_install_id,
      period_type: event.properties.period_type, cancel_reason: event.properties.cancel_reason,
      expiration_reason: event.properties.expiration_reason, country: event.properties.country })
    return result
  }))
  if (!sent) throw new Error('Billing export unavailable')
  await db.update(schema.subscriptionEvents).set({ exportedAt: new Date() }).where(inArray(schema.subscriptionEvents.id, billing.map(event => event.id)))
  advance(billing.length)
}
export default monitorBackend('cron/analytics-export',handler)
