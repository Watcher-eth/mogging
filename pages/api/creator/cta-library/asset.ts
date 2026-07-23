import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { CREATOR_CTA_LIBRARY_TYPES, MAX_CREATOR_CTA_LIBRARY_BYTES, storeCreatorAsset } from '@/lib/storage/videos'

export const config = { api: { bodyParser: false } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const key = Array.isArray(req.query.key) ? req.query.key[0] : req.query.key
    if (!key?.startsWith(`creators/${session.user.id}/cta-library/`)) throw new ApiError(400, 'Invalid upload key')
    const contentType = req.headers['content-type']?.split(';')[0]
    if (!contentType || !CREATOR_CTA_LIBRARY_TYPES.includes(contentType as (typeof CREATOR_CTA_LIBRARY_TYPES)[number])) throw new ApiError(400, 'Unsupported CTA format')
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.byteLength
      if (size > MAX_CREATOR_CTA_LIBRARY_BYTES) throw new ApiError(413, 'CTA asset is too large')
      chunks.push(buffer)
    }
    if (!size) throw new ApiError(400, 'CTA asset is empty')
    await storeCreatorAsset(key, Buffer.concat(chunks), contentType)
    return json(res, 201, { uploaded: true })
  } catch (error) {
    return handleApiError(error, res)
  }
}
