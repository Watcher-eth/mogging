import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { claimStudioRequirementsReminder } from '@/lib/creator/studio-submission'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    return json(res, 200, await claimStudioRequirementsReminder(session.user.id))
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('creator/studio/requirements', handler)
