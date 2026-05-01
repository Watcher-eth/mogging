import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { getCurrentUserPhotoRank } from '@/lib/leaderboards/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  const session = await getAuthSession(req, res)
  if (!session?.user?.id) {
    return handleApiError(new ApiError(401, 'Authentication required'), res)
  }

  try {
    const rank = await getCurrentUserPhotoRank(session.user.id)
    return json(res, 200, rank)
  } catch (error) {
    return handleApiError(error, res)
  }
}
