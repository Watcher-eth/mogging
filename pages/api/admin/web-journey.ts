import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { getWebJourneyDetail } from '@/lib/admin/web-journey-query'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    await enforceRateLimit(req, res, { key: 'admin_web_journey', limit: 30, windowMs: 60000 })
    return json(res, 200, await getWebJourneyDetail(z.string().uuid().parse(req.query.flowId)))
  } catch (error) { return handleApiError(error, res) }
}
