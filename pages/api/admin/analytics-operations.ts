import type { NextApiRequest, NextApiResponse } from 'next'
import { operationalFilters, getOperationalData } from '@/lib/admin/operations'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res,['GET'])
    await requireCreatorAdmin(req,res)
    await enforceRateLimit(req,res,{key:'admin_analytics_operations',limit:30,windowMs:60_000})
    const filters = operationalFilters.safeParse(req.query)
    if (!filters.success) throw new ApiError(400,'Choose a supported reporting section and period')
    return json(res,200,await getOperationalData(filters.data))
  } catch (error) { return handleApiError(error,res) }
}
