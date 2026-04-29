import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getShareByToken, SharingServiceError } from '@/lib/sharing/service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const token = Array.isArray(req.query.token) ? req.query.token[0] : req.query.token
    if (!token) throw new SharingServiceError(404, 'Share not found')

    const share = await getShareByToken(token)
    return json(res, 200, share)
  } catch (error) {
    if (error instanceof SharingServiceError) {
      return handleApiError(new ApiError(error.status, error.message), res)
    }

    return handleApiError(error, res)
  }
}
