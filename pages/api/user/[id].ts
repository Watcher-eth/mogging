import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getPublicUserProfile, UserServiceError } from '@/lib/users/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const id = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    if (!id) throw new UserServiceError(404, 'User not found')

    const profile = await getPublicUserProfile(id)
    return res.status(200).json(profile)
  } catch (error) {
    if (error instanceof UserServiceError) {
      return handleApiError(new ApiError(error.status, error.message), res)
    }

    return handleApiError(error, res)
  }
}

