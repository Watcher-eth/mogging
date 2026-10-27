import { readSupportAllowance, reserveSupportMessage } from '@/lib/creator/support/allowance-store'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createSupportDataSource } from '@/lib/creator/support/data'
import { runSupportAgent } from '@/lib/creator/support/agent'
import { supportRequestSchema } from '@/lib/creator/support/contracts'
import { readSupportConversation, signSupportConversation, nextSupportMemory } from '@/lib/creator/support/conversation'

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
    const secret = process.env.NEXTAUTH_SECRET
    if (!secret) throw new ApiError(503, 'Creator support is not configured')
    const memory = readSupportConversation(input.conversation, session.user.id, secret)
    const source = await createSupportDataSource(session.user.id)
    const reservation = await reserveSupportMessage(creatorId)
    if (!reservation.accepted) return res.status(429).json({ error: { code: 'rate_limited', message: 'You’ve used your 4 messages for today. Your allowance resets at midnight UTC.', details: { allowance: reservation.allowance } } })
    try {
      const disconnect = new AbortController()
      res.once('close', () => { if (!res.writableEnded) disconnect.abort() })
      const result = await runSupportAgent({ input, memory, source, sampleData: false, apiKey: process.env.OPENROUTER_API_KEY, signal: AbortSignal.any([disconnect.signal, AbortSignal.timeout(45_000)]) })
      result.conversation = signSupportConversation(nextSupportMemory(memory, input.message, result), session.user.id, secret)
      result.allowance = await readSupportAllowance(creatorId)
      return json(res, 200, result)
    } catch (error) { await reservation.refund(); throw error }
  } catch (error) { return handleApiError(error, res) }
}
