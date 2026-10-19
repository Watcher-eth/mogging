import type { NextApiRequest, NextApiResponse } from 'next'
import { unstable_cache } from 'next/cache'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { getSubmissionForCreator } from '@/lib/creator/service'
import { emptyPostPreview, getCreatorPostPreview } from '@/lib/creator/post-preview'

const getPreview = unstable_cache(async (postUrl: string | null) => {
  const preview = await getCreatorPostPreview(postUrl)
  // Provider outages must not become an hour-long missing cover.
  if (!preview.thumbnailUrl && !preview.caption && preview.viewCount === null) throw new Error('Post details unavailable')
  return preview
}, ['creator-post-details-v2'], { revalidate: 300 })

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store')
  try {
    if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) throw new ApiError(401, 'Authentication required')
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    const submission = await getSubmissionForCreator(session.user.id, id)
    if (!submission) throw new ApiError(404, 'Submission not found')
    const preview = await getPreview(submission.postUrl).catch(() => emptyPostPreview)
    return json(res, 200, preview)
  } catch (error) { return handleApiError(error, res) }
}
