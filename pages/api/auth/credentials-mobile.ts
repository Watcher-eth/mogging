import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createMobileSessionFromCredentials } from '@/lib/auth/mobile-session'

const credentialsSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(200),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, { key: 'auth_credentials_mobile', limit: 10, windowMs: 15 * 60 * 1000 })
    const input = parseBody(credentialsSchema, req.body)
    const session = await createMobileSessionFromCredentials(input)
    return json(res, 200, {
      token: session.sessionToken,
      expiresAt: session.expires.toISOString(),
      userId: session.userId,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
