import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getAnonymousActorId } from '@/lib/auth/anonymous'
import { canReadPhoto, ownsPhoto } from '@/lib/photos/access'
import { db, schema } from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    res.setHeader('Cache-Control', 'private, no-store')
    const userId = await getRequestUserId(req, res)
    const actor = { userId, anonymousActorId: getAnonymousActorId(req) }

    const id = typeof req.query.id === 'string' ? req.query.id : null
    if (!id) throw new ApiError(400, 'Missing analysis id')

    const analysis = await db.query.analyses.findFirst({
      where: eq(schema.analyses.id, id),
      with: {
        photo: true,
      },
    })

    if (!analysis || !canReadPhoto(analysis.photo, actor)) {
      throw new ApiError(404, 'Analysis not found')
    }

    return json(res, 200, {
      canManage: ownsPhoto(analysis.photo, actor),
      photo: {
        id: analysis.photo.id,
        imageUrl: analysis.photo.imageUrl,
        imageHash: analysis.photo.imageHash,
        isPublic: analysis.photo.isPublic,
      },
      analysis: {
        id: analysis.id,
        status: analysis.status,
        pslScore: analysis.pslScore,
        harmonyScore: analysis.harmonyScore,
        dimorphismScore: analysis.dimorphismScore,
        angularityScore: analysis.angularityScore,
        percentile: analysis.percentile,
        tier: analysis.tier,
        tierDescription: analysis.tierDescription,
        metrics: analysis.metrics,
        landmarks: analysis.landmarks,
        failureReason: analysis.failureReason,
      },
      deduped: true,
    })
  } catch (error) {
    return handleApiError(error, res)
  }
}
