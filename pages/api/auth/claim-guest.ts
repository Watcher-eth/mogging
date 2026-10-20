import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { claimGuestAccount } from '@/lib/auth/mobile-guest'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    await enforceRateLimit(req, res, { key: 'claim-guest', limit: 20, windowMs: 60 * 60 * 1000 })
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to save your results')
    const { recoveryKey } = parseBody(z.object({ recoveryKey: z.string().regex(/^[a-f0-9]{64}$/) }), req.body)
    return json(res, 200, { saved: await claimGuestAccount(userId, recoveryKey) })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('auth/claim-guest', handler)
