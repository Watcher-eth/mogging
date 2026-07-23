import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { redeemPaymentActivationCode } from '@/lib/payments/entitlements'
import { recordServerEvent } from '@/lib/analytics/events'

const redeemCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const input = parseBody(redeemCodeSchema, req.body)
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in before redeeming a web purchase')

    const entitlements = await redeemPaymentActivationCode({
      code: input.code,
      mobileInstallId: input.mobileInstallId,
      userId,
    })

    await recordServerEvent({
      eventName: 'activation_code_redeemed',
      accountId: userId,
      source: 'activation_code',
      properties: { mobileInstallId: input.mobileInstallId },
    })

    return json(res, 200, { entitlements })
  } catch (error) {
    return handleApiError(error, res)
  }
}
