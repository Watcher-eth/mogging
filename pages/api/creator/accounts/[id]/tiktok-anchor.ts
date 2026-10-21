import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import {
  ApiError,
  handleApiError,
  json,
  methodNotAllowed,
  parseBody,
} from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { followerRangeSchema } from '@/lib/creator/tiktok-anchor'
import { updateTikTokAnchorAccount } from '@/lib/creator/tiktok-anchor-service'

const inputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('followers'), range: followerRangeSchema }),
  z.object({ action: z.literal('joined'), confirmed: z.literal(true) }),
])

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'PATCH') return methodNotAllowed(res, ['PATCH'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const id = z.string().uuid().parse(req.query.id)
    return json(res, 200, {
      account: await updateTikTokAnchorAccount(
        session.user.id,
        id,
        parseBody(inputSchema, req.body)
      ),
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
