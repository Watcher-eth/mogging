import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { createReferralTicket, getReferralLink } from '@/lib/referrals/service'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method === 'GET') {
      const userId = await getRequestUserId(req, res)
      if (!userId) throw new ApiError(401, 'Sign in to get your invite link')
      return json(res, 200, await getReferralLink(userId))
    }
    if (req.method === 'POST') {
      await enforceRateLimit(req, res, { key: 'referral_capture', limit: 30, windowMs: 60_000 })
      const ticket = await createReferralTicket(typeof req.body?.code === 'string' ? req.body.code : '')
      if (!ticket) throw new ApiError(404, 'Invite link not found')
      return json(res, 200, { ticket })
    }
    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) { return handleApiError(error, res) }
}
