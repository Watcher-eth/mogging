import type { NextApiRequest, NextApiResponse } from 'next'
import { monitorBackend } from '@/lib/reliability/monitor'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['POST', 'PATCH'].includes(req.method || '')) return methodNotAllowed(res, ['POST', 'PATCH'])
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    throw new ApiError(410, 'Post-specific setup has been retired. Reuse your account link or code from Accounts and submit your published post when it qualifies.')
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('creator/posts', handler)
