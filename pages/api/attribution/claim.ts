import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { recordCreatorSignup } from '@/lib/creator/attribution'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    await recordCreatorSignup({ req, userId: session.user.id })
    return json(res, 200, { claimed: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
