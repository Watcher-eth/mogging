import type { NextApiRequest, NextApiResponse } from 'next'
import { analyticsFilters, getAnalyticsDashboard } from '@/lib/admin/analytics'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    await enforceRateLimit(req, res, { key: 'admin_analytics', limit: 30, windowMs: 60_000 })
    const filters = analyticsFilters.safeParse(req.query)
    if (!filters.success) throw new ApiError(400, 'Choose a supported time range and platform')
    return json(res, 200, await getAnalyticsDashboard(filters.data))
  } catch (error) { return handleApiError(error, res) }
}
