import { CREATOR_INVITER_COOKIE, readCreatorInviter } from '@/lib/creator/creator-referral-cookie'
import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth/session'
import { creatorDashboardViews, creatorProfileSchema, getCreatorDashboard, getCreatorMoneyDashboard, getCreatorSetupStatus, getOrCreateCreatorProfile, saveCreatorProfile } from '@/lib/creator/service'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    res.setHeader('Cache-Control', 'private, no-store')
    const referralCode = readCreatorInviter(req.cookies[CREATOR_INVITER_COOKIE])
    if (referralCode) await getOrCreateCreatorProfile(session.user.id, referralCode)
    if (req.method === 'GET') {
      const view = req.query.view === undefined || process.env.PORTAL_SCOPED_READS_DISABLED === '1'
        ? undefined : parseBody(z.enum(creatorDashboardViews), req.query.view)
      if (view === 'money') return json(res, 200, await getCreatorMoneyDashboard(session.user.id))
      if (view === 'setup') return json(res, 200, await getCreatorSetupStatus(session.user.id))
      return json(res, 200, await getCreatorDashboard(session.user.id, view))
    }
    if (req.method === 'POST') {
      await getOrCreateCreatorProfile(session.user.id)
      return json(res, 200, { registered: true })
    }
    if (req.method === 'PATCH') {
      const input = parseBody(creatorProfileSchema, req.body)
      return json(res, 200, { profile: await saveCreatorProfile(session.user.id, input) })
    }
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH'])
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator',handler)
