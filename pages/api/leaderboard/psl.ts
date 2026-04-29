import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getPslLeaderboard, pslLeaderboardQuerySchema } from '@/lib/leaderboards/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = pslLeaderboardQuerySchema.parse(req.query)
    const leaderboard = await getPslLeaderboard(query)
    return res.status(200).json(leaderboard)
  } catch (error) {
    return handleApiError(error, res)
  }
}

