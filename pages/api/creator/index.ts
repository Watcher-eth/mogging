import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { creatorProfileSchema, getCreatorDashboard, saveCreatorProfile } from '@/lib/creator/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    if (req.method === 'GET') {
      return json(res, 200, await getCreatorDashboard(session.user.id))
    }
    if (req.method === 'PATCH') {
      const input = parseBody(creatorProfileSchema, req.body)
      return json(res, 200, { profile: await saveCreatorProfile(session.user.id, input) })
    }
    return methodNotAllowed(res, ['GET', 'PATCH'])
  } catch (error) {
    return handleApiError(error, res)
  }
}
