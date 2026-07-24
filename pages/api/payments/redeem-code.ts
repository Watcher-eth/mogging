import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { redeemPaymentActivationCode } from '@/lib/payments/entitlements'
import { redeemInviteCode } from '@/lib/payments/invite-codes'
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

    const { entitlements, source } = await redeemAnyAccessCode({
      code: input.code,
      mobileInstallId: input.mobileInstallId,
      userId,
    })

    await recordServerEvent({
      eventName: 'activation_code_redeemed',
      accountId: userId,
      source,
      properties: { mobileInstallId: input.mobileInstallId },
    })

    return json(res, 200, { entitlements })
  } catch (error) {
    return handleApiError(error, res)
  }
}

async function redeemAnyAccessCode({
  code,
  mobileInstallId,
  userId,
}: {
  code: string
  mobileInstallId: string
  userId: string
}) {
  try {
    return {
      source: 'activation_code',
      entitlements: await redeemPaymentActivationCode({ code, mobileInstallId, userId }),
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) throw error
  }

  return {
    source: 'invite_code',
    entitlements: await redeemInviteCode({ code, mobileInstallId, userId }),
  }
}
