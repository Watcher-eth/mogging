import type { NextApiRequest, NextApiResponse } from 'next'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { settleBundledPayout, settlePayoutRequestSchema } from '@/lib/creator/bundled-payouts'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])
    await requireCreatorAdmin(req, res)
    return json(res, 200, { request: await settleBundledPayout(parseBody(settlePayoutRequestSchema, req.body)) })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('admin/creator/payout-requests', handler)
export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }
