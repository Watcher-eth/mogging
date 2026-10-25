import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { ownsPhoto, type PhotoViewer } from '@/lib/photos/access'
import { createShareToken } from './token'

export const createAnalysisShareSchema = z.object({
  analysisId: z.string().min(1),
  ownerUserId: z.string().min(1).nullable().optional(),
  ownerAnonymousActorId: z.string().min(1).nullable().optional(),
  includeLeaderboard: z.boolean().default(false).transform(() => false),
})

export type CreateAnalysisShareInput = z.infer<typeof createAnalysisShareSchema>

export class SharingServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function createAnalysisShare(input: CreateAnalysisShareInput) {
  const data = createAnalysisShareSchema.parse(input)
  const analysis = await db.query.analyses.findFirst({
    where: eq(schema.analyses.id, data.analysisId),
    with: {
      photo: true,
    },
  })

  if (!analysis) {
    throw new SharingServiceError(404, 'Analysis not found')
  }

  if (analysis.status !== 'complete') {
    throw new SharingServiceError(400, 'Only completed analyses can be shared')
  }

  if (!ownsPhoto(analysis.photo, { userId: data.ownerUserId ?? null, anonymousActorId: data.ownerAnonymousActorId ?? null })) {
    throw new SharingServiceError(403, 'You do not have access to this analysis')
  }

  const existing = await db.query.analysisShares.findFirst({
    where: and(
      eq(schema.analysisShares.analysisId, analysis.id),
      data.ownerUserId
        ? eq(schema.analysisShares.ownerUserId, data.ownerUserId)
        : isNull(schema.analysisShares.ownerUserId),
      data.ownerAnonymousActorId
        ? eq(schema.analysisShares.ownerAnonymousActorId, data.ownerAnonymousActorId)
        : isNull(schema.analysisShares.ownerAnonymousActorId),
      eq(schema.analysisShares.includeLeaderboard, data.includeLeaderboard)
    ),
  })

  if (existing) {
    return {
      share: existing,
      existing: true,
    }
  }

  const [share] = await db
    .insert(schema.analysisShares)
    .values({
      token: createShareToken(),
      analysisId: analysis.id,
      photoId: analysis.photoId,
      ownerUserId: data.ownerUserId ?? null,
      ownerAnonymousActorId: data.ownerAnonymousActorId ?? null,
      includeLeaderboard: data.includeLeaderboard,
      leaderboardSnapshot: null,
    })
    .returning()

  return {
    share,
    existing: false,
  }
}

export async function getShareByToken(token: string, viewer: PhotoViewer = { userId: null, anonymousActorId: null }) {
  const share = await db.query.analysisShares.findFirst({
    where: eq(schema.analysisShares.token, token),
    with: {
      analysis: true,
      photo: {
        with: {
          rating: true,
        },
      },
      owner: {
        columns: {
          id: true,
          name: true,
          image: true,
          verified: true,
        },
      },
    },
  })

  if (!share) {
    throw new SharingServiceError(404, 'Share not found')
  }

  if (!ownsPhoto(share.photo, viewer)) {
    throw new SharingServiceError(404, 'Share not found')
  }

  return {
    token: share.token,
    createdAt: share.createdAt,
    includeLeaderboard: false,
    leaderboardSnapshot: null,
    owner: share.owner,
    photo: {
      id: share.photo.id,
      imageUrl: share.photo.imageUrl,
      name: share.photo.name,
      caption: share.photo.caption,
      gender: share.photo.gender,
      photoType: share.photo.photoType,
      displayRating: share.photo.rating?.displayRating ?? null,
      winCount: share.photo.rating?.winCount ?? 0,
      lossCount: share.photo.rating?.lossCount ?? 0,
    },
    analysis: {
      id: share.analysis.id,
      pslScore: share.analysis.pslScore,
      harmonyScore: share.analysis.harmonyScore,
      dimorphismScore: share.analysis.dimorphismScore,
      angularityScore: share.analysis.angularityScore,
      percentile: share.analysis.percentile,
      tier: share.analysis.tier,
      tierDescription: share.analysis.tierDescription,
      metrics: share.analysis.metrics,
      landmarks: share.analysis.landmarks,
      model: share.analysis.model,
      promptVersion: share.analysis.promptVersion,
      createdAt: share.analysis.createdAt,
    },
  }
}
