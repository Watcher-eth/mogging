import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { refreshCreatorAccountAvatars } from '@/lib/creator/account-avatars'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    res.setHeader('Cache-Control', 'private, no-store')
    return json(res, 200, { accounts: await refreshCreatorAccountAvatars(session.user.id) })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('creator/account-avatars', handler)
