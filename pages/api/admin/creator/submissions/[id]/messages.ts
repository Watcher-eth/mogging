import type { NextApiRequest, NextApiResponse } from 'next'
import { requireCreatorAdmin } from '@/lib/admin/creator-auth'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getSubmissionMessages, markSubmissionMessagesRead, sendSubmissionMessage, submissionMessageSchema, submissionReadSchema } from '@/lib/creator/submission-messages'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'PATCH') return methodNotAllowed(res, ['GET', 'POST', 'PATCH'])
    const { session } = await requireCreatorAdmin(req, res)
    if (!session.user.id) throw new ApiError(401, 'Authentication required')
    const actor = { userId: session.user.id, role: 'team' as const }
    if (typeof req.query.id !== 'string') throw new ApiError(400, 'Invalid submission')
    res.setHeader('Cache-Control', 'private, no-store')
    return json(res, 200, req.method === 'GET'
      ? await getSubmissionMessages(req.query.id, actor, typeof req.query.cursor === 'string' ? req.query.cursor : undefined)
      : req.method === 'PATCH' ? await markSubmissionMessagesRead(req.query.id, actor, parseBody(submissionReadSchema, req.body).messageId)
      : await sendSubmissionMessage(req.query.id, actor, parseBody(submissionMessageSchema, req.body)))
  } catch (error) { return handleApiError(error, res) }
}
