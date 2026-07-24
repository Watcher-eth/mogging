import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createMobileSessionForUser, getRequestUserId } from '@/lib/auth/mobile-session'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, { key: 'auth_mobile_session', limit: 10, windowMs: 15 * 60 * 1000 })
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in before continuing to the app')

    const session = await createMobileSessionForUser(userId)
    return json(res, 200, {
      token: session.sessionToken,
      expiresAt: session.expires.toISOString(),
      userId: session.userId,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
