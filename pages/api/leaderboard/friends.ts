import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getPhotoLeaderboard, photoLeaderboardQuerySchema } from '@/lib/leaderboards/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to see your friends leaderboard')
    const query = photoLeaderboardQuerySchema.parse(req.query)
    return json(res, 200, { ...await getPhotoLeaderboard(query, userId), viewerId: userId })
  } catch (error) {
    return handleApiError(error, res)
  }
}
