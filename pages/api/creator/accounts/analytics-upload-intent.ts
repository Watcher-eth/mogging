import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import {
  createCreatorAccountAnalyticsUpload,
  CREATOR_VIDEO_TYPES,
  MAX_CREATOR_ANALYTICS_VIDEO_BYTES,
} from '@/lib/storage/videos'

const uploadIntentSchema = z.object({
  contentType: z.enum(CREATOR_VIDEO_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_CREATOR_ANALYTICS_VIDEO_BYTES),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const input = parseBody(uploadIntentSchema, req.body)
    return json(res, 200, await createCreatorAccountAnalyticsUpload(session.user.id, input.contentType, input.sizeBytes))
  } catch (error) {
    return handleApiError(error, res)
  }
}
