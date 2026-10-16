import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { payoutPreferenceSchema, payoutRequestSchema, requestBundledPayout, setBundledPayouts } from '@/lib/creator/bundled-payouts'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (!['POST', 'PATCH'].includes(req.method || '')) return methodNotAllowed(res, ['POST', 'PATCH'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    if (req.method === 'PATCH') return json(res, 200, await setBundledPayouts(session.user.id, parseBody(payoutPreferenceSchema, req.body).bundledPayouts))
    return json(res, 200, { request: await requestBundledPayout(session.user.id, parseBody(payoutRequestSchema, req.body).expectedAmountCents) })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('creator/payouts', handler)
