import type { NextApiRequest, NextApiResponse } from 'next'
import { monitorBackend } from '@/lib/reliability/monitor'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { publishRegisteredPost, publishRegisteredPostSchema, registerCreatorPost, registerPostSchema } from '@/lib/creator/post-registration'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['POST', 'PATCH'].includes(req.method || '')) return methodNotAllowed(res, ['POST', 'PATCH'])
  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    await enforceRateLimit(req, res, { key: 'creator_posts', identity: session.user.id, limit: 20, windowMs: 60_000 })
    const post = req.method === 'POST'
      ? await registerCreatorPost(session.user.id, parseBody(registerPostSchema, req.body))
      : await publishRegisteredPost(session.user.id, parseBody(publishRegisteredPostSchema, req.body))
    return json(res, req.method === 'POST' ? 201 : 200, { post })
  } catch (error) { return handleApiError(error, res) }
}
export default monitorBackend('creator/posts', handler)
