import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { clearAnonymousActorCookie, getAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import {
  deleteAnonymousProfile,
  getCurrentUserDashboard,
  deleteUserProfile,
  updateUserProfile,
  updateUserProfileSchema,
  UserServiceError,
} from '@/lib/users/service'
import { getRequestLocation } from '@/lib/geo/request'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getAuthSession(req, res)

  if (req.method === 'DELETE') {
    try {
      if (session?.user?.id) {
        await deleteUserProfile(session.user.id)
        return json(res, 200, { deleted: true, scope: 'user' })
      }

      const anonymousActorId = getAnonymousActorId(req)
      if (anonymousActorId) {
        await deleteAnonymousProfile(anonymousActorId)
        clearAnonymousActorCookie(res)
      }

      return json(res, 200, { deleted: true, scope: 'anonymous' })
    } catch (error) {
      return handleUserError(error, res)
    }
  }

  if (req.method === 'GET') {
    if (!session?.user?.id) {
      return handleApiError(new ApiError(401, 'Authentication required'), res)
    }

    try {
      const dashboard = await getCurrentUserDashboard(session.user.id)
      return json(res, 200, dashboard)
    } catch (error) {
      return handleUserError(error, res)
    }
  }

  if (req.method === 'PATCH') {
    if (!session?.user?.id) {
      return handleApiError(new ApiError(401, 'Authentication required'), res)
    }

    try {
      const location = getRequestLocation(req)
      const input = parseBody(updateUserProfileSchema, {
        ...req.body,
        ...(location.country ? location : null),
      })
      const user = await updateUserProfile(session.user.id, input)
      return json(res, 200, { user })
    } catch (error) {
      return handleUserError(error, res)
    }
  }

  return methodNotAllowed(res, ['GET', 'PATCH', 'DELETE'])
}

function handleUserError(error: unknown, res: NextApiResponse) {
  if (error instanceof UserServiceError) {
    return handleApiError(new ApiError(error.status, error.message), res)
  }

  return handleApiError(error, res)
}
