import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getEntitlementSummary } from '@/lib/payments/entitlements'

const querySchema = z.object({
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = querySchema.parse(req.query)
    const userId = await getRequestUserId(req, res)
    if (!userId) throw new ApiError(401, 'Sign in to load payment access')

    return json(res, 200, {
      entitlements: await getEntitlementSummary({
        mobileInstallId: query.mobileInstallId,
        userId,
        revenueCatAppUserId: userId,
      }),
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
