import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { confirmCheckoutForAccount, getEntitlementSummary } from '@/lib/payments/entitlements'
import { monitorBackend } from '@/lib/reliability/monitor'
import { createHash } from 'node:crypto'
import { recordServerEvent } from '@/lib/analytics/events'
import { stripeJourneyProperties } from '@/lib/analytics/web-context'

const inputSchema = z.object({ sessionId: z.string().trim().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/) })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const { sessionId } = parseBody(inputSchema, req.body)
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in with the account used at checkout')
    const entitlement = await confirmCheckoutForAccount(sessionId, userId)
    const summary = await getEntitlementSummary({ userId, mobileInstallId: entitlement.mobileInstallId })
    const metadata = entitlement.metadata as Record<string, string | undefined> | null
    const analytics = stripeJourneyProperties(metadata)
    // This proves access for the authenticated buyer, independently of browser callbacks.
    if (summary.evaluationCredits > 0 || summary.subscription.active) {
      const hash = createHash('sha256').update(`stripe-access:${sessionId}:${userId}`).digest('hex')
      await recordServerEvent({ eventName: 'purchase_activated', eventId: `${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`,
        accountId: userId, sessionId, source: 'stripe_access_verified', properties: { ...analytics, surface: entitlement.source, product: entitlement.product, provider: 'stripe' } })
    }
    return json(res, 200, { entitlements: summary, analytics })
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('payments/confirm', handler)
