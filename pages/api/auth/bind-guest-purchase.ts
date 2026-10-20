import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { verifyAppleTransaction } from '@/lib/auth/apple-transaction'
import { bindGuestPurchase } from '@/lib/auth/mobile-guest'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 60 }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    await enforceRateLimit(req, res, { key: 'bind-guest-purchase', limit: 30, windowMs: 60 * 60 * 1000 })
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'A valid guest session is required')
    const { signedTransaction } = parseBody(z.object({ signedTransaction: z.string().min(100).max(30000) }), req.body)
    return json(res, 200, { bound: await bindGuestPurchase(userId, await verifyAppleTransaction(signedTransaction)) })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('auth/bind-guest-purchase', handler)
