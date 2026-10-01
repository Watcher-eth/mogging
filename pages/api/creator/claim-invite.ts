import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { claimCreatorInvite } from '@/lib/creator/invites'
import { creatorInviteTokenSchema } from '@/lib/creator/invite-validation'
import { env } from '@/lib/env'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const expectedOrigin = new URL(env.NEXTAUTH_URL || env.NEXT_PUBLIC_SITE_URL || 'https://www.mogging.com').origin
    if (req.headers.origin !== expectedOrigin) throw new ApiError(403, 'Invalid request origin')
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const { token } = parseBody(z.object({ token: creatorInviteTokenSchema }), req.body)
    return json(res, 200, await claimCreatorInvite(token, session.user.id))
  } catch (error) { return handleApiError(error, res) }
}
