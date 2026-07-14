import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { getCreatorProfile } from '@/lib/creator/service'
import {
  createCreatorVideoUpload,
  CREATOR_VIDEO_TYPES,
  MAX_CREATOR_VIDEO_BYTES,
} from '@/lib/storage/videos'

const uploadIntentSchema = z.object({
  contentType: z.enum(CREATOR_VIDEO_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_CREATOR_VIDEO_BYTES),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    if (!(await getCreatorProfile(session.user.id))) {
      throw new ApiError(409, 'Finish creator authentication before uploading')
    }
    const input = parseBody(uploadIntentSchema, req.body)
    return json(res, 200, await createCreatorVideoUpload(session.user.id, input.contentType, input.sizeBytes))
  } catch (error) {
    return handleApiError(error, res)
  }
}
