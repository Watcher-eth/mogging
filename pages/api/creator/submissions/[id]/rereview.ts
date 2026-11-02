import type { NextApiRequest, NextApiResponse } from 'next'
import { waitUntil } from '@vercel/functions'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { requestSubmissionReview } from '@/lib/creator/service'
import { creatorSubmissionAnalyticsSchema } from '@/lib/creator/validation'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    if (typeof req.query.id !== 'string') throw new ApiError(400, 'Submission required')
    const input = parseBody(creatorSubmissionAnalyticsSchema, req.body)
    const submission = await requestSubmissionReview(session.user.id, req.query.id, input)
    waitUntil(import('@/lib/creator/audience-check-worker').then(worker => worker.reconcileAudienceChecks(1, submission.id)).catch(() => {}))
    return json(res, 200, { submission })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/submission-rereview', handler)
export const config = { maxDuration: 300 }
