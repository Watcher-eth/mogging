import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { recordCreatorInstall } from '@/lib/creator/attribution'

const installSchema = z.object({
  attributionToken: z.string().min(40).max(200),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
  try {
    const input = parseBody(installSchema, req.body)
    const userId = await getRequestUserId(req, res)
    const result = await recordCreatorInstall({ token: input.attributionToken, mobileInstallId: input.mobileInstallId, userId })
    if (!result) throw new ApiError(400, 'Invalid or expired creator attribution token')
    return json(res, result.created ? 201 : 200, { attributed: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
