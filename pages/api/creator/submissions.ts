import { CREATOR_INVITER_COOKIE, readCreatorInviter } from '@/lib/creator/creator-referral-cookie'
import { waitUntil } from '@vercel/functions'
import { getOrCreateCreatorProfile } from '@/lib/creator/service'
import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import {
  createCreatorSubmission,
  creatorSubmissionSchema,
  getCreatorDashboard,
} from '@/lib/creator/service'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    if (req.method === 'GET') {
      const dashboard = await getCreatorDashboard(session.user.id, process.env.PORTAL_SCOPED_READS_DISABLED === '1' ? undefined : 'ledger')
      return json(res, 200, { submissions: dashboard.submissions, payments: dashboard.payments })
    }
    if (req.method === 'POST') {
      const referralCode = readCreatorInviter(req.cookies[CREATOR_INVITER_COOKIE])
      if (referralCode) await getOrCreateCreatorProfile(session.user.id, referralCode)
      const input = parseBody(creatorSubmissionSchema, req.body)
      const submission = await createCreatorSubmission(session.user.id, input)
      waitUntil(import('@/lib/creator/audience-check-worker').then(worker => worker.reconcileAudienceChecks(1, submission.id)).catch(() => {}))
      return json(res, 201, { submission })
    }
    return methodNotAllowed(res, ['GET', 'POST'])
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/submissions',handler)
export const config = { maxDuration: 300 }
