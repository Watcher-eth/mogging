import type { NextApiRequest, NextApiResponse } from 'next'
import { creatorAdminReviewSchema, reviewCreatorResource } from '@/lib/admin/creator-service'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { reconcileCreatorScores } from '@/lib/admin/creator-score-service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])
    const { session, email } = await requireCreatorAdmin(req, res)
    const input = parseBody(creatorAdminReviewSchema, req.body)
    // Persist before/after states; score refresh failures must not turn a saved review into an error.
    try { await reconcileCreatorScores('Before admin review', email) } catch { console.error('Creator score refresh pending before review') }
    const record = await reviewCreatorResource(input, session.user.id)
    try { await reconcileCreatorScores(`Admin ${input.resource} review saved`, email) } catch { console.error('Creator score refresh pending after review') }
    return json(res, 200, { record })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export const config = { api: { bodyParser: { sizeLimit: '8mb' } } }
