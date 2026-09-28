import type { NextApiRequest, NextApiResponse } from 'next'
import { timingSafeEqual } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { sendPostHogBatch, toPostHogEvent } from '@/lib/analytics/posthog'
export const config = { maxDuration: 60 }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') return res.status(405).end()
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual = Buffer.from(req.headers.authorization || '')
  if (!process.env.CRON_SECRET || expected.length !== actual.length || !timingSafeEqual(expected, actual)) return res.status(401).end()
  if (!process.env.POSTHOG_PROJECT_KEY) return res.status(200).json({ enabled: false })
  let exported = 0
  const started = Date.now()
  try {
    // Stable UUIDs make overlapping invocations and ambiguous network retries idempotent downstream.
    for (let page = 0; page < 10 && Date.now() - started < 35_000; page++) {
      const events = await db.select().from(schema.analyticsEvents)
        .where(and(isNull(schema.analyticsEvents.exportedAt), eq(schema.analyticsEvents.environment, 'production')))
        .orderBy(asc(schema.analyticsEvents.receivedAt)).limit(200)
      if (!events.length) break
      await sendPostHogBatch(events.map(event => toPostHogEvent({ ...event, eventId: event.eventId })))
      await db.update(schema.analyticsEvents).set({ exportedAt: new Date() }).where(inArray(schema.analyticsEvents.eventId, events.map(event => event.eventId)))
      exported += events.length
    }
    const billing = await db.select().from(schema.subscriptionEvents)
      .where(and(isNull(schema.subscriptionEvents.exportedAt), eq(schema.subscriptionEvents.environment, 'production')))
      .orderBy(asc(schema.subscriptionEvents.receivedAt)).limit(200)
    if (billing.length) {
      await sendPostHogBatch(billing.map(event => {
        const result = toPostHogEvent({ ...event, eventId: event.id, anonymousId: event.externalUserId ? `${event.provider}:${event.externalUserId}` : null, platform: 'server' })
        // Verified billing is the sole revenue owner. Amount is in currency units, never guessed cents.
        Object.assign(result.properties, { billing_provider: event.provider, product_id: event.productId,
          billing_amount: event.amount == null ? null : Number(event.amount), billing_currency: event.currency, billing_event_id: event.providerEventId,
          mobile_install_id: event.properties.mobile_install_id,
          period_type: event.properties.period_type, cancel_reason: event.properties.cancel_reason,
          expiration_reason: event.properties.expiration_reason, country: event.properties.country })
        return result
      }))
      await db.update(schema.subscriptionEvents).set({ exportedAt: new Date() }).where(inArray(schema.subscriptionEvents.id, billing.map(event => event.id)))
      exported += billing.length
    }
    return res.status(200).json({ enabled: true, exported })
  } catch (error) {
    console.error('Analytics export failed', error instanceof Error ? error.message : 'unknown')
    return res.status(502).json({ exported, error: 'export_failed' })
  }
}
