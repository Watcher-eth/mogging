import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { getPerformanceRevenue } from '@/lib/admin/creator-performance-revenue'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'

const filters = z.object({ start: z.iso.date(), end: z.iso.date(), platform: z.enum(['all','tiktok','instagram']) }).refine(v => v.start <= v.end && Date.parse(v.end) - Date.parse(v.start) <= 3660 * 86400000)
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control','private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res,['GET'])
    await requireCreatorAdmin(req,res)
    const parsed = filters.safeParse(req.query)
    if (!parsed.success) throw new ApiError(400,'Choose a valid date range and platform')
    return json(res,200,await getPerformanceRevenue(parsed.data.start,parsed.data.end,parsed.data.platform))
  } catch (error) { return handleApiError(error,res) }
}
