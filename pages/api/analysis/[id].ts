import type { NextApiRequest, NextApiResponse } from 'next'
import { eq } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getAuthSession } from '@/lib/auth/session'
import { db, schema } from '@/lib/db'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET'])

  try {
    const session = await getAuthSession(req, res)
    if (!session?.user?.id) {
      throw new ApiError(401, 'Authentication required')
    }

    const id = typeof req.query.id === 'string' ? req.query.id : null
    if (!id) throw new ApiError(400, 'Missing analysis id')

    const analysis = await db.query.analyses.findFirst({
      where: eq(schema.analyses.id, id),
      with: {
        photo: true,
      },
    })

    if (!analysis || analysis.photo.userId !== session.user.id) {
      throw new ApiError(404, 'Analysis not found')
    }

    return json(res, 200, {
      photo: {
        id: analysis.photo.id,
        imageUrl: analysis.photo.imageUrl,
        imageHash: analysis.photo.imageHash,
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
