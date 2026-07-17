import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
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
    const anonymousActorId = userId ? null : getOrSetAnonymousActorId(req, res)

    return json(res, 200, {
      entitlements: await getEntitlementSummary({
        mobileInstallId: query.mobileInstallId,
        userId,
        anonymousActorId,
        revenueCatAppUserId: readHeader(req.headers['x-mogging-revenuecat-app-user-id']),
      }),
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
