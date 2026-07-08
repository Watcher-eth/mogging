import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import { redeemPaymentActivationCode } from '@/lib/payments/entitlements'

const redeemCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const input = parseBody(redeemCodeSchema, req.body)
    const session = await getAuthSession(req, res)
    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)

    const entitlements = await redeemPaymentActivationCode({
      code: input.code,
      mobileInstallId: input.mobileInstallId,
      userId: session?.user?.id ?? null,
      anonymousActorId,
    })

    return json(res, 200, { entitlements })
  } catch (error) {
    return handleApiError(error, res)
  }
}
