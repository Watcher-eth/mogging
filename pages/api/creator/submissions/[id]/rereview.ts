import type { NextApiRequest, NextApiResponse } from 'next'
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
    return json(res, 200, { submission: await requestSubmissionReview(session.user.id, req.query.id, input) })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/submission-rereview', handler)
