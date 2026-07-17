import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { createCreatorAttributionClick, recordCreatorInstall } from '@/lib/creator/attribution'

const openSchema = z.object({
  slug: z.string().trim().min(3).max(200),
  mobileInstallId: z.string().trim().min(8).max(120),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])

  try {
    const input = parseBody(openSchema, req.body)
    const userId = await getRequestUserId(req, res)
    const attribution = await createCreatorAttributionClick({
      slug: input.slug,
      anonymousActorId: null,
      referrer: readHeader(req.headers.referer),
      userAgent: readHeader(req.headers['user-agent']),
    })
    if (!attribution || attribution.isBot) throw new ApiError(404, 'Creator attribution link not found')

    const result = await recordCreatorInstall({
      token: attribution.token,
      mobileInstallId: input.mobileInstallId,
      userId,
    })
    if (!result) throw new ApiError(400, 'Unable to record creator attribution')

    return json(res, result.created ? 201 : 200, {
      attributed: true,
      token: attribution.token,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
