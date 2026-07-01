import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { claimStripeCheckoutSession } from '@/lib/payments/entitlements'

const claimSchema = z.object({
  sessionId: z.string().min(1),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    if (!env.STRIPE_SECRET_KEY) {
      throw new ApiError(503, 'Payments are not configured')
    }

    const input = parseBody(claimSchema, req.body)
    const session = await getAuthSession(req, res)
    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)
    const entitlements = await claimStripeCheckoutSession({
      sessionId: input.sessionId,
      mobileInstallId: input.mobileInstallId,
      userId: session?.user?.id ?? null,
      anonymousActorId,
    })

    return json(res, 200, {
      entitlements,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
