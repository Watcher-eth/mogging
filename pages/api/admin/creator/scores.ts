import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { getCreatorScoreHistory, reconcileCreatorScores } from '@/lib/admin/creator-score-service'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const { email } = await requireCreatorAdmin(req, res)
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const query = z.object({ creatorId: z.string().min(1).max(120).optional(), before: z.string().uuid().optional() }).parse(req.query)
    if (query.creatorId) return json(res, 200, await getCreatorScoreHistory(query.creatorId, query.before))
    // Reconcile on admin reads as well as scheduled runs; append only when evidence changes.
    return json(res, 200, await reconcileCreatorScores('Admin refresh: metrics, activity or evidence changed', email))
  } catch (error) { return handleApiError(error, res) }
}
