import type { NextApiRequest, NextApiResponse } from 'next'
import { monitorBackend } from '@/lib/reliability/monitor'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getAccountCreatorAttribution } from '@/lib/creator/attribution'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Authentication required')
    const context = await getAccountCreatorAttribution(userId)
    return json(res, 200, { url: context ? `mogging://r/${encodeURIComponent(context.creatorSlug || 'recovered')}?attribution_token=${encodeURIComponent(context.token)}` : null })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('attribution/account', handler)
