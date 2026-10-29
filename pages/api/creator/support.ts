import { readSupportAllowance } from '@/lib/creator/support/allowance-store'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { supportRequestSchema } from '@/lib/creator/support/contracts'
import { executeCreatorSupport, SupportDailyLimit } from '@/lib/creator/support/service'

export const config = { api: { bodyParser: { sizeLimit: '24kb' } }, maxDuration: 60 }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const creatorId = session.user.id
    if (req.method === 'GET') return json(res, 200, await readSupportAllowance(creatorId))
    await enforceRateLimit(req, res, { key: 'creator-support', identity: session.user.id, limit: 20, windowMs: 60_000 })
    const input = parseBody(supportRequestSchema, req.body)
    const disconnect = new AbortController()
    res.once('close', () => { if (!res.writableEnded) disconnect.abort() })
    return json(res, 200, await executeCreatorSupport(creatorId, input, { signal: AbortSignal.any([disconnect.signal, AbortSignal.timeout(45_000)]) }))
  } catch (error) {
    if (error instanceof SupportDailyLimit) return res.status(429).json({ error: { code: 'rate_limited', message: error.message, details: { allowance: error.allowance } } })
    return handleApiError(error, res)
  }
}
