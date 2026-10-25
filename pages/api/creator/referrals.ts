import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { ApiError, json, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getCreatorReferralReport } from '@/lib/creator/creator-referrals'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const report = await getCreatorReferralReport(session.user.id)
    if (!report) throw new ApiError(403, 'Complete your creator setup before inviting creators')
    return json(res, 200, report)
  } catch (error) { return handleApiError(error, res) }
}
