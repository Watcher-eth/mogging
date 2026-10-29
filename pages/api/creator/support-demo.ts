import { createSupportAllowanceStore } from '@/lib/creator/support/allowance-ledger'
import { createHmac, randomBytes } from 'node:crypto'
import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { runSupportAgent } from '@/lib/creator/support/agent'
import { createDemoDataSource } from '@/lib/creator/support/demo'
import { supportRequestSchema } from '@/lib/creator/support/contracts'
import { readSupportConversation, signSupportConversation, nextSupportMemory } from '@/lib/creator/support/conversation'
const demoSecret = process.env.NEXTAUTH_SECRET ? createHmac('sha256', process.env.NEXTAUTH_SECRET).update('creator-support-local-demo').digest('hex') : randomBytes(32).toString('hex')
// The private development preview never consumes a shared creator allowance.
const { readSupportAllowance, reserveSupportMessage } = createSupportAllowanceStore(null, false)
export const config = { api: { bodyParser: { sizeLimit: '24kb' } }, maxDuration: 60 }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (process.env.NODE_ENV === 'production' || process.env.CREATOR_SUPPORT_LOCAL_DEMO !== '1') return res.status(404).end()
  try {
    if (req.method !== 'POST' && req.method !== 'GET') return methodNotAllowed(res, ['GET', 'POST'])
    const creatorId = 'local-demo'
    if (req.method === 'GET') return json(res, 200, await readSupportAllowance(creatorId))
    await enforceRateLimit(req, res, { key: 'creator-support-demo', limit: 30, windowMs: 60_000 })
    const input = parseBody(supportRequestSchema, req.body)
    const memory = readSupportConversation(input.conversation, 'local-demo', demoSecret)
    const reservation = await reserveSupportMessage(creatorId)
    if (!reservation.accepted) return res.status(429).json({ error: { code: 'rate_limited', message: 'You’ve used your 4 messages for today. Your allowance resets at midnight UTC.', details: { allowance: reservation.allowance } } })
    try {
      const disconnect = new AbortController()
      res.once('close', () => { if (!res.writableEnded) disconnect.abort() })
      const result = await runSupportAgent({ input, memory, source: createDemoDataSource(), sampleData: true, apiKey: process.env.OPENROUTER_API_KEY, signal: AbortSignal.any([disconnect.signal, AbortSignal.timeout(45_000)]) })
      result.conversation = signSupportConversation(nextSupportMemory(memory, input.message, result), 'local-demo', demoSecret)
      result.allowance = await readSupportAllowance(creatorId)
      return json(res, 200, result)
    } catch (error) { await reservation.refund(); throw error }
  } catch (error) { return handleApiError(error, res) }
}
