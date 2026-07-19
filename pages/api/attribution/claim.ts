import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getAuthSession } from '@/lib/auth/session'
import { associateMobileCreatorAttribution, recordCreatorSignup } from '@/lib/creator/attribution'

const mobileClaimSchema = z.object({
  attributionToken: z.string().min(40).max(200),
  mobileInstallId: z.string().trim().min(8).max(120),
}).partial()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const mobileInput = mobileClaimSchema.parse(req.body || {})
    if (mobileInput.attributionToken || mobileInput.mobileInstallId) {
      if (!mobileInput.attributionToken || !mobileInput.mobileInstallId) throw new ApiError(400, 'Attribution token and mobile install ID are required')
      const userId = await getRequestUserId(req, res)
      if (!userId) throw new ApiError(401, 'Authentication required')
      const attribution = await associateMobileCreatorAttribution({
        token: mobileInput.attributionToken,
        mobileInstallId: mobileInput.mobileInstallId,
        userId,
      })
      if (!attribution) throw new ApiError(400, 'Invalid or expired creator attribution token')
      return json(res, 200, { claimed: true, attribution })
    }
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    await recordCreatorSignup({ req, userId: session.user.id })
    return json(res, 200, { claimed: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
