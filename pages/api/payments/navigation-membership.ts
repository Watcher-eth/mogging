import type { NextApiRequest, NextApiResponse } from 'next'
import { waitUntil } from '@vercel/functions'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getEntitlementSummary } from '@/lib/payments/entitlements'
import { navigationMembershipEnabled, readNavigationMembership } from '@/lib/payments/navigation-membership'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to load membership')
    // This response is only for navigation. Protected pages and credit
    // operations continue to use their existing server-side verification.
    const subscription = navigationMembershipEnabled()
      ? await readNavigationMembership(userId, waitUntil)
      : (await getEntitlementSummary({ userId })).subscription
    return json(res, 200, { entitlements: { subscription } })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('payments/navigation-membership', handler)
