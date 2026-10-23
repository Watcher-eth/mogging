import type { NextApiRequest, NextApiResponse } from 'next'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { creatorPostUrlSchema } from '@/lib/creator/validation'
import { resolveCreatorPostLink } from '@/lib/creator/post-identity'
import { publishedVideoEmbedUrl } from '@/lib/creator/post-embed'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const parsed = creatorPostUrlSchema.safeParse(req.query.url)
    if (!parsed.success) throw new ApiError(400, 'Enter a published TikTok or Instagram post URL')
    let canonical: Awaited<ReturnType<typeof resolveCreatorPostLink>>
    try { canonical = await resolveCreatorPostLink(parsed.data) }
    catch { throw new ApiError(400, 'Paste the full post URL to preview this video') }
    res.setHeader('Cache-Control', 'private, no-store')
    return json(res, 200, { canonicalUrl: canonical.url, embedUrl: publishedVideoEmbedUrl(canonical.url) })
  } catch (error) { return handleApiError(error, res) }
}
