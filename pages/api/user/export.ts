import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { exportMemberData } from '@/lib/users/member-account'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
  try {
    const userId = (await getAuthSession(req, res))?.user?.id
    if (!userId) throw new ApiError(401, 'Sign in to export your data.')
    const data = await exportMemberData(userId)
    if (!data) throw new ApiError(404, 'Account not found.')
    res.setHeader('Content-Disposition', 'attachment; filename="mogging-data.json"')
    return res.status(200).json(data)
  } catch (error) {
    return handleApiError(error, res)
  }
}
