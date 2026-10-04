import type { NextApiRequest,NextApiResponse } from 'next'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { getReliabilityData } from '@/lib/admin/reliability'
import { analyticsFilters } from '@/lib/admin/analytics'
import { ApiError,handleApiError,json,methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'

export default async function handler(req:NextApiRequest,res:NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store')
  try {
    if(req.method!=='GET') return methodNotAllowed(res,['GET'])
    await requireCreatorAdmin(req,res)
    await enforceRateLimit(req,res,{key:'admin_reliability',limit:30,windowMs:60_000})
    const filters=analyticsFilters.pick({days:true}).safeParse(req.query)
    if(!filters.success) throw new ApiError(400,'Choose a supported reporting period')
    return json(res,200,await getReliabilityData(Number(filters.data.days)))
  } catch(error) { return handleApiError(error,res) }
}
