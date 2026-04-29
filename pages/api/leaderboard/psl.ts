import type { NextApiRequest, NextApiResponse } from 'next'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getPslLeaderboard, pslLeaderboardQuerySchema } from '@/lib/leaderboards/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = pslLeaderboardQuerySchema.parse(req.query)
    const leaderboard = await getPslLeaderboard(query)
    return json(res, 200, leaderboard)
  } catch (error) {
    return handleApiError(error, res)
  }
}
