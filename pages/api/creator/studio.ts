import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { listStudioGenerations, registerStudioGeneration, submitStudioPost } from '@/lib/creator/studio-submission'
import { monitorBackend } from '@/lib/reliability/monitor'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    if (req.method === 'GET') return json(res, 200, { generations: await listStudioGenerations(session.user.id) })
    if (req.method === 'POST') return json(res, 201, { generation: await registerStudioGeneration(session.user.id, req.body) })
    if (req.method === 'PATCH') return json(res, 200, { submission: await submitStudioPost(session.user.id, req.body) })
    return methodNotAllowed(res, ['GET', 'POST', 'PATCH'])
  } catch (error) { return handleApiError(error, res) }
}
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }
export default monitorBackend('creator/studio', handler)
