import { monitorBackend } from '@/lib/reliability/monitor'
import type { NextApiRequest, NextApiResponse } from 'next'
import { and, count, eq, isNull, lte, sql } from 'drizzle-orm'
import { ApiError, handleApiError, json, methodNotAllowed } from '@/lib/api/http'
import { getRequestUserId } from '@/lib/auth/mobile-session'
import { getAnonymousActorId } from '@/lib/auth/anonymous'
import { canReadPhoto, ownsPhoto } from '@/lib/photos/access'
import { db, schema } from '@/lib/db'

async function handler(req: NextApiRequest, res: NextApiResponse) {
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

    if (req.query.view === 'heading') {
      const { analyses, photos } = schema
      const scoredReport = sql`coalesce(${analyses.metrics}->>'presentation', '') NOT IN ('face-study', 'face-model')`
      const presentation = analysis.metrics.presentation
      const owner = analysis.photo.userId
        ? eq(photos.userId, analysis.photo.userId)
        : and(isNull(photos.userId), eq(photos.anonymousActorId, actor.anonymousActorId!))
      const position = db.select({ createdAt: analyses.createdAt, id: analyses.id }).from(analyses).where(eq(analyses.id, id))
      const [row] = analysis.status === 'complete' && analysis.photo.photoType === 'face' && presentation !== 'face-study' && presentation !== 'face-model'
        ? await db.select({ number: count() }).from(analyses)
          .innerJoin(photos, eq(photos.id, analyses.photoId))
          .where(and(owner, eq(photos.photoType, 'face'), eq(analyses.status, 'complete'), scoredReport,
            lte(sql`(${analyses.createdAt}, ${analyses.id})`, sql`(${position})`)))
        : []
      return json(res, 200, { number: row?.number ?? null })
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
        createdAt: analysis.createdAt,
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

export default monitorBackend('analysis/[id]',handler)
