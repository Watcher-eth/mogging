import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getCreatorStripeCustomer } from '@/lib/payments/creator-discount'
import { validateWebReturnOffer } from '@/lib/payments/web-return-offer'

const input = z.object({ sessionId: z.string().regex(/^cs_(?:test_|live_)?[A-Za-z0-9]+$/).max(200) })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const accountId = await getRequestUserId(req, res)
    if (!accountId) throw new ApiError(401, 'Sign in to check your offer')
    await enforceRateLimit(req, res, { key: 'web_return_offer', identity: accountId, limit: 10, windowMs: 60_000 })
    const { sessionId } = parseBody(input, req.body)
    await validateWebReturnOffer(accountId, sessionId, await getCreatorStripeCustomer(accountId))
    return json(res, 200, { eligible: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
