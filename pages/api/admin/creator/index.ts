import type { NextApiRequest, NextApiResponse } from 'next'
import { getCreatorAdminDashboard } from '@/lib/admin/creator-service'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    await requireCreatorAdmin(req, res)
    return json(res, 200, await getCreatorAdminDashboard({ includeCoverage: req.query.coverage !== '0' }))
  } catch (error) {
    return handleApiError(error, res)
  }
}
