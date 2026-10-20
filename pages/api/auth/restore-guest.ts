import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { recoverGuestPurchase } from '@/lib/auth/mobile-guest'
import { verifyAppleTransaction } from '@/lib/auth/apple-transaction'
import { monitorBackend } from '@/lib/reliability/monitor'

export const config = { maxDuration: 60 }
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    await enforceRateLimit(req, res, { key: 'restore-guest', limit: 10, windowMs: 60 * 60 * 1000 })
    const { signedTransaction } = parseBody(z.object({ signedTransaction: z.string().min(100).max(30000) }), req.body)
    const proof = await verifyAppleTransaction(signedTransaction)
    return json(res, 200, await recoverGuestPurchase(proof))
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('auth/restore-guest', handler)
