import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { publicCreatorAttributionContext, resolveMobileCreatorAttribution } from '@/lib/creator/attribution'

const resolveSchema = z.object({
  attributionToken: z.string().min(40).max(200),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const input = parseBody(resolveSchema, req.body)
    const userId = await getRequestUserId(req, res)
    const context = await resolveMobileCreatorAttribution({
      token: input.attributionToken,
      mobileInstallId: input.mobileInstallId,
      userId,
    })
    if (!context) throw new ApiError(400, 'Invalid or expired creator attribution token')
    return json(res, 200, { attributed: true, attribution: publicCreatorAttributionContext(context) })
  } catch (error) {
    return handleApiError(error, res)
  }
}
