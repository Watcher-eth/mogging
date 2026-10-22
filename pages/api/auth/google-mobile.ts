import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { beginGoogleMobile, finishGoogleMobile } from '@/lib/auth/google-mobile'
import { mobileGoogleInput } from '@/lib/auth/google-mobile-state'
import { monitorBackend } from '@/lib/reliability/monitor'

const exchange = z.object({ code: z.string().min(1).max(4000), state: z.string().max(1200),
  verifier: z.string().min(43).max(128), referralTicket: z.string().max(120).optional() })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    await enforceRateLimit(req, res, { key: 'google_mobile', limit: 20, windowMs: 60_000 })
    if (req.body?.code) {
      const result = await finishGoogleMobile(parseBody(exchange, req.body))
      return json(res, 200, { token: result.sessionToken, userId: result.userId, expiresAt: result.expires.toISOString() })
    }
    return json(res, 200, beginGoogleMobile(parseBody(mobileGoogleInput, req.body)))
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('auth/google-mobile', handler)
