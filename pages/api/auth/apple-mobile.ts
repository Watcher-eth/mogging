import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { createMobileSessionFromApple } from '@/lib/auth/mobile-session'

const appleMobileSchema = z.object({
  identityToken: z.string().min(100).max(10_000),
  nonce: z.string().min(16).max(200),
  name: z.string().trim().max(120).nullable().optional(),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const input = parseBody(appleMobileSchema, req.body)
    const session = await createMobileSessionFromApple(input)
    return json(res, 200, {
      token: session.sessionToken,
      expiresAt: session.expires.toISOString(),
      userId: session.userId,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
