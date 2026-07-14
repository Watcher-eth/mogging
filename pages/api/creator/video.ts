import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { isR2Configured } from '@/lib/env'
import { CREATOR_VIDEO_TYPES, MAX_CREATOR_VIDEO_BYTES, storeLocalCreatorVideo } from '@/lib/storage/videos'

export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    if (isR2Configured()) throw new ApiError(404, 'Local upload endpoint unavailable')
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')

    const key = Array.isArray(req.query.key) ? req.query.key[0] : req.query.key
    if (!key?.startsWith(`creators/${session.user.id}/`)) throw new ApiError(400, 'Invalid upload key')
    const contentType = req.headers['content-type']?.split(';')[0]
    if (!CREATOR_VIDEO_TYPES.includes(contentType as (typeof CREATOR_VIDEO_TYPES)[number])) {
      throw new ApiError(400, 'Unsupported video format')
    }

    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_CREATOR_VIDEO_BYTES) throw new ApiError(413, 'Video must be 500 MB or smaller')
      chunks.push(buffer)
    }
    if (!size) throw new ApiError(400, 'Video is empty')
    await storeLocalCreatorVideo(key, Buffer.concat(chunks))
    return json(res, 201, { uploaded: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
