import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import {
  getCurrentUserDashboard,
  updateUserProfile,
  updateUserProfileSchema,
  UserServiceError,
} from '@/lib/users/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getAuthSession(req, res)
  if (!session?.user?.id) {
    return handleApiError(new ApiError(401, 'Authentication required'), res)
  }

  if (req.method === 'GET') {
    try {
      const dashboard = await getCurrentUserDashboard(session.user.id)
      return res.status(200).json(dashboard)
    } catch (error) {
      return handleUserError(error, res)
    }
  }

  if (req.method === 'PATCH') {
    try {
      const input = parseBody(updateUserProfileSchema, req.body)
      const user = await updateUserProfile(session.user.id, input)
      return res.status(200).json({ user })
    } catch (error) {
      return handleUserError(error, res)
    }
  }

  return methodNotAllowed(res, ['GET', 'PATCH'])
}

function handleUserError(error: unknown, res: NextApiResponse) {
  if (error instanceof UserServiceError) {
    return handleApiError(new ApiError(error.status, error.message), res)
  }

  return handleApiError(error, res)
}

