import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { ApiError, handleApiError, json, methodNotAllowed, parseBody } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { createCreatorCtaLibraryUpload, CREATOR_CTA_LIBRARY_TYPES, MAX_CREATOR_CTA_LIBRARY_BYTES } from '@/lib/storage/videos'

const schema = z.object({
  contentType: z.enum(CREATOR_CTA_LIBRARY_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_CREATOR_CTA_LIBRARY_BYTES),
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const input = parseBody(schema, req.body)
    return json(res, 200, await createCreatorCtaLibraryUpload(session.user.id, input.contentType, input.sizeBytes))
  } catch (error) {
    return handleApiError(error, res)
  }
}
