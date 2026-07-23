import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { enforceRateLimit } from '@/lib/api/rateLimit'
import { createMobileSessionForUser } from '@/lib/auth/mobile-session'
import { consumePaymentHandoff } from '@/lib/payments/handoff'

const consumeHandoffSchema = z.object({
  token: z.string().trim().min(80).max(4096),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    await enforceRateLimit(req, res, {
      key: 'payment_handoff_consume',
      limit: 10,
      windowMs: 15 * 60 * 1000,
    })
    const input = parseBody(consumeHandoffSchema, req.body)
    const handoff = await consumePaymentHandoff({
      token: input.token,
      mobileInstallId: input.mobileInstallId,
    })
    const session = await createMobileSessionForUser(handoff.accountId)
    return json(res, 200, {
      session: {
        token: session.sessionToken,
        expiresAt: session.expires.toISOString(),
        userId: session.userId,
      },
      entitlements: handoff.entitlements,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
