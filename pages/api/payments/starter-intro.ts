import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { env } from '@/lib/env'
import { issueStarterIntro, readStarterIntro, starterIntroCookie } from '@/lib/payments/web-starter-intro'

const input = z.object({ flowId: z.string().uuid() })

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const secret = env.NEXTAUTH_SECRET
    if (!secret) throw new ApiError(503, 'The first-month offer is temporarily unavailable')
    const { flowId } = parseBody(input, req.body)
    const name = starterIntroCookie(flowId)
    const existing = readStarterIntro(flowId, req.cookies[name], secret)
    if (existing !== null) return json(res, 200, { deadline: existing, serverNow: Date.now() })
    await enforceRateLimit(req, res, { key: 'web_starter_intro', limit: 20, windowMs: 60_000 })
    const { deadline, value } = issueStarterIntro(flowId, secret)
    res.setHeader('Set-Cookie', `${name}=${value}; HttpOnly; SameSite=Lax; Path=/api/payments; Max-Age=86400${env.NODE_ENV === 'production' ? '; Secure' : ''}`)
    return json(res, 200, { deadline, serverNow: Date.now() })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default handler
