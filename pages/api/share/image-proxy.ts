import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, methodNotAllowed } from '@/lib/api/http'

const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const src = typeof req.query.src === 'string' ? req.query.src : null
    if (!src) throw new ApiError(400, 'Missing image source')

    const url = new URL(src)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new ApiError(400, 'Unsupported image source')
    }

    const response = await fetch(url)
    if (!response.ok) throw new ApiError(502, 'Unable to load source image')

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
    if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
      throw new ApiError(415, 'Unsupported source image type')
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > MAX_IMAGE_BYTES) throw new ApiError(413, 'Source image is too large')

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(200).send(buffer)
  } catch (error) {
    return handleApiError(error, res)
  }
}
