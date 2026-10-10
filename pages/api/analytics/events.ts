import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { analyticsEventSchema, recordAnalyticsEvents } from '@/lib/analytics/events'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { db, schema } from '@/lib/db'

export const config = { api: { bodyParser: { sizeLimit: '192kb' } } }

const requestSchema = z.object({
  events: z.array(z.unknown()).min(1).max(50),
})

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, {
      key: 'analytics_events',
      limit: 120,
      windowMs: 60 * 1000,
    })
    const input = parseBody(requestSchema, req.body)
    const accountId = await getRequestUserId(req, res)
    const now = Date.now()
    const valid = input.events.map(event => analyticsEventSchema.safeParse(event)).flatMap(result => result.success ? [result.data] : [])
    const events = valid.filter(event => event.platform !== 'server'
      && !/^(revenuecat|stripe):/.test(event.anonymousId || '')
      && !['checkout_completed', 'handoff_created', 'handoff_consumed', 'activation_code_redeemed'].includes(event.eventName)
      && Date.parse(event.occurredAt) >= now - 30 * 86400_000
      && Date.parse(event.occurredAt) <= now + 300_000).map((event) => ({
      ...event,
      // A queued event from a previous account must never be relabelled on account switch.
      accountId: accountId && event.accountId === accountId ? accountId : undefined,
      environment: process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production' ? 'development' as const : event.environment,
      source: event.platform === 'web' ? 'web' : 'mobile',
    }))

    await recordAnalyticsEvents(events)
    const links = events.filter(event => event.eventName === 'identity_linked' && event.accountId && event.anonymousId)
      .map(event => ({ accountId: event.accountId!, anonymousId: event.anonymousId!, platform: event.platform }))
    if (links.length) await db.insert(schema.analyticsIdentityLinks).values(links).onConflictDoNothing()
    return json(res, 202, { accepted: events.length, rejected: input.events.length - events.length })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('analytics/events',handler)
