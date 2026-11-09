import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { payoutQueue, prepareCryptoBatch, readCryptoBatch } from '@/lib/admin/crypto-payouts/queue'
import { attachEvmHashes, beginEvm, cancelPreparedBatch, reconcileCryptoBatch, submitSolana } from '@/lib/admin/crypto-payouts/settlement'
import { payoutChains } from '@/lib/admin/crypto-payouts/shared'

const batchId = z.string().regex(/^0x[a-f0-9]{64}$/)
const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('prepare'), chain: z.enum(payoutChains), preview: z.string().regex(/^[a-f0-9]{64}$/) }),
  z.object({ action: z.literal('submit-solana'), id: batchId, signed: z.array(z.string().max(2000)).min(1).max(40) }),
  z.object({ action: z.literal('begin-evm'), id: batchId }),
  z.object({ action: z.literal('attach-evm'), id: batchId, hashes: z.array(z.string().regex(/^0x[0-9a-fA-F]{64}$/)).min(1).max(200) }),
  z.object({ action: z.literal('cancel'), id: batchId }),
  z.object({ action: z.literal('reconcile'), id: batchId }),
])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST'])
    const { session } = await requireCreatorAdmin(req, res)
    if (!session.user.id) throw new ApiError(401, 'Admin account required')
    if (req.method === 'GET') {
      if (req.query.id === undefined) return json(res, 200, { networks: await payoutQueue() })
      const id = batchId.safeParse(req.query.id)
      if (!id.success) throw new ApiError(400, 'Invalid payout batch ID')
      return json(res, 200, await readCryptoBatch(id.data))
    }
    if (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin') throw new ApiError(403, 'Use the admin payout page to submit this request')
    const input = parseBody(inputSchema, req.body)
    switch (input.action) {
      case 'prepare': return json(res, 200, await prepareCryptoBatch(input.chain, input.preview, session.user.id))
      case 'submit-solana': return json(res, 200, await submitSolana(input.id, session.user.id, input.signed))
      case 'begin-evm': return json(res, 200, await beginEvm(input.id, session.user.id))
      case 'attach-evm': return json(res, 200, await attachEvmHashes(input.id, input.hashes))
      case 'cancel': return json(res, 200, await cancelPreparedBatch(input.id))
      case 'reconcile': return json(res, 200, await reconcileCryptoBatch(input.id))
    }
  } catch (error) { return handleApiError(error, res) }
}
