import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getLeaderboardProfile } from '@/lib/leaderboards/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const photoId = Array.isArray(req.query.photoId) ? req.query.photoId[0] : req.query.photoId
    if (!photoId) throw new ApiError(400, 'Missing photoId')

    const profile = await getLeaderboardProfile(photoId)
    if (!profile) throw new ApiError(404, 'Profile not found')

    return json(res, 200, profile)
  } catch (error) {
    return handleApiError(error, res)
  }
}
