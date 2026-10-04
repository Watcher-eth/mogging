import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    throw new ApiError(410, 'Connect your TikTok handle or profile URL in Accounts. Social-account OAuth is currently disabled.')
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/oauth/tiktok/start',handler)
