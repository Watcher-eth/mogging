import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { analyticsEventSchema, recordAnalyticsEvents } from '@/lib/analytics/events'
import { getRequestUserId } from '@/lib/auth/mobile-session'

const requestSchema = z.object({
  events: z.array(analyticsEventSchema).min(1).max(50),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, {
      key: 'analytics_events',
      limit: 120,
      windowMs: 60 * 1000,
    })
    const input = parseBody(requestSchema, req.body)
    const accountId = await getRequestUserId(req, res)
    const events = input.events.map((event) => ({
      ...event,
      accountId: accountId || undefined,
    }))

    await recordAnalyticsEvents(events)
    return json(res, 202, { accepted: events.length })
  } catch (error) {
    return handleApiError(error, res)
  }
}
