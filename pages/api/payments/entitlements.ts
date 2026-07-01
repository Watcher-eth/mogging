import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getOrSetAnonymousActorId } from '@/lib/auth/anonymous'
import { getAuthSession } from '@/lib/auth/session'
import { getEntitlementSummary } from '@/lib/payments/entitlements'

const querySchema = z.object({
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const query = querySchema.parse(req.query)
    const session = await getAuthSession(req, res)
    const anonymousActorId = session?.user?.id ? null : getOrSetAnonymousActorId(req, res)

    return json(res, 200, {
      entitlements: await getEntitlementSummary({
        mobileInstallId: query.mobileInstallId,
        userId: session?.user?.id ?? null,
        anonymousActorId,
      }),
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
