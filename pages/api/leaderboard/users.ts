import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed, publicCache } from '@/lib/api/http'
import { getUserLeaderboard, userLeaderboardQuerySchema } from '@/lib/leaderboards/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = userLeaderboardQuerySchema.parse(req.query)
    const leaderboard = await getUserLeaderboard(query)
    publicCache(res, 10, 60)
    return json(res, 200, leaderboard)
  } catch (error) {
    return handleApiError(error, res)
  }
}
