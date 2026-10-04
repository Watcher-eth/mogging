import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { claimCreatorInvite } from '@/lib/creator/invites'
import { creatorInviteTokenSchema } from '@/lib/creator/invite-validation'
import { env } from '@/lib/env'
import { siteUrl } from '@/lib/seo'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const allowedOrigins = new Set([siteUrl, 'https://mogging.com'])
    if (env.NEXTAUTH_URL) allowedOrigins.add(new URL(env.NEXTAUTH_URL).origin)
    if (!req.headers.origin || !allowedOrigins.has(req.headers.origin)) throw new ApiError(403, 'Invalid request origin')
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const { token } = parseBody(z.object({ token: creatorInviteTokenSchema }), req.body)
    return json(res, 200, await claimCreatorInvite(token, session.user.id))
  } catch (error) { return handleApiError(error, res) }
}

export default monitorBackend('creator/claim-invite',handler)
