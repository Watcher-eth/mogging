import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createGuestSession } from '@/lib/auth/mobile-guest'
import { monitorBackend } from '@/lib/reliability/monitor'

const inputSchema = z.object({ recoveryKey: z.string().regex(/^[a-f0-9]{64}$/), recoverOnly: z.boolean().optional() })
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'no-store')
  try {
    await enforceRateLimit(req, res, { key: 'guest-session', limit: 30, windowMs: 60 * 60 * 1000 })
    const input = parseBody(inputSchema, req.body)
    return json(res, 200, await createGuestSession(input.recoveryKey, input.recoverOnly))
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('auth/guest-mobile', handler)
