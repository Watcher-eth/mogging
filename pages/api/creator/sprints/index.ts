import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { getAuthSession } from '@/lib/auth/session'
import {
  ApiError,
  handleApiError,
  json,
  methodNotAllowed,
} from '@/lib/api/http'
import { listCreatorSprints } from '@/lib/creator/sprint-service'
async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    return json(res, 200, { sprints: await listCreatorSprints() })
  } catch (error) {
    return handleApiError(error, res)
  }
}

export default monitorBackend('creator/sprints',handler)
