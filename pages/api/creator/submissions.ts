import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import {
  createCreatorSubmission,
  creatorSubmissionSchema,
  getCreatorDashboard,
} from '@/lib/creator/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    if (req.method === 'GET') {
      const dashboard = await getCreatorDashboard(session.user.id)
      return json(res, 200, { submissions: dashboard.submissions, payments: dashboard.payments })
    }
    if (req.method === 'POST') {
      const input = parseBody(creatorSubmissionSchema, req.body)
      const submission = await createCreatorSubmission(session.user.id, input)
      return json(res, 201, { submission })
    }
    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
