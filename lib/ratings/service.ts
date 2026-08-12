import { and, count, eq, inArray, ne, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { ageBucketSchema, hairColorSchema, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'
import {
  conservativeScore,
  displayRating,
  initialSkillRating,
  RATING_ALGORITHM,
  updateRatingsForWin,
  type SkillRating,
} from './trueskill'

export const pairSelectionSchema = z.object({
  ageBucket: ageBucketSchema.or(z.literal('all')).default('all'),
  gender: z.enum(['male', 'female', 'other', 'all']).default('female'),
  hairColor: hairColorSchema.or(z.literal('all')).default('all'),
  skinColor: skinColorSchema.or(z.literal('all')).default('all'),
  state: z.union([z.literal('all'), z.string().trim().regex(/^[A-Z]{2}$/)]).default('all'),
  photoType: z.enum(['face', 'body', 'outfit']).default('face'),
  region: z.enum(['global', 'north-america', 'europe', 'asia', 'south-america', 'africa', 'oceania', 'nearby']).default('global'),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(500).default(100),
}).superRefine((value, context) => {
  if (value.region === 'nearby' && (value.latitude === undefined || value.longitude === undefined)) {
    context.addIssue({ code: 'custom', message: 'Location is required for nearby comparisons' })
  }
})

export const submitVoteSchema = z.object({
  winnerPhotoId: z.string().min(1),
  loserPhotoId: z.string().min(1),
  voterUserId: z.string().min(1).nullable().optional(),
  anonymousActorId: z.string().min(1).nullable().optional(),
})

export type PairSelectionInput = z.infer<typeof pairSelectionSchema>
export type SubmitVoteInput = z.infer<typeof submitVoteSchema>

export class RatingServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function selectComparisonPair(input: PairSelectionInput) {
  const params = pairSelectionSchema.parse(input)
  const filters = [
    eq(schema.photos.isPublic, true),
    eq(schema.photos.photoType, params.photoType),
    inArray(schema.photos.source, params.region === 'nearby' ? ['seeded', 'instagram', 'user'] : ['seeded', 'instagram']),
    params.gender === 'all' ? undefined : eq(schema.photos.gender, params.gender),
    params.hairColor === 'all' ? undefined : eq(schema.photos.hairColor, params.hairColor),
    params.skinColor === 'all' ? undefined : eq(schema.photos.skinColor, params.skinColor),
    params.state === 'all'
      ? undefined
      : sql`coalesce(${schema.users.state}, ${schema.anonymousProfiles.state}) = ${params.state}`,
    params.ageBucket === 'all' ? undefined : ageBucketFilter(params.ageBucket),
    regionFilter(params),
  ].filter(Boolean) as SQL[]

  const where = and(...filters)
  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.photos)
    .leftJoin(schema.users, eq(schema.users.id, schema.photos.userId))
    .leftJoin(schema.anonymousProfiles, eq(schema.anonymousProfiles.anonymousActorId, schema.photos.anonymousActorId))
    .where(where)

  if (total < 2) {
    throw new RatingServiceError(400, 'Not enough photos to compare')
  }

  const firstOffset = Math.floor(Math.random() * total)
  const [first] = await db
    .select(comparisonPhotoSelection)
    .from(schema.photos)
    .leftJoin(schema.users, eq(schema.users.id, schema.photos.userId))
    .leftJoin(schema.anonymousProfiles, eq(schema.anonymousProfiles.anonymousActorId, schema.photos.anonymousActorId))
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .leftJoin(schema.analyses, eq(schema.analyses.photoId, schema.photos.id))
    .where(where)
    .offset(firstOffset)
    .limit(1)

  if (!first) {
    throw new RatingServiceError(400, 'Not enough photos to compare')
  }

  const second = await selectRandomComparisonPhoto(filters, first.photo.id)

  return {
    left: toComparisonPhoto(first),
    right: toComparisonPhoto(second),
  }
}

async function selectRandomComparisonPhoto(filters: SQL[], excludedPhotoId: string) {
  const secondFilters = [...filters, ne(schema.photos.id, excludedPhotoId)].filter(Boolean) as SQL[]
  const secondWhere = and(...secondFilters)
  const [{ total: secondTotal }] = await db
    .select({ total: count() })
    .from(schema.photos)
    .leftJoin(schema.users, eq(schema.users.id, schema.photos.userId))
    .leftJoin(schema.anonymousProfiles, eq(schema.anonymousProfiles.anonymousActorId, schema.photos.anonymousActorId))
    .where(secondWhere)

  if (secondTotal < 1) {
    throw new RatingServiceError(400, 'Not enough photos to compare')
  }

  const secondOffset = Math.floor(Math.random() * secondTotal)
  const [second] = await db
    .select(comparisonPhotoSelection)
    .from(schema.photos)
    .leftJoin(schema.users, eq(schema.users.id, schema.photos.userId))
    .leftJoin(schema.anonymousProfiles, eq(schema.anonymousProfiles.anonymousActorId, schema.photos.anonymousActorId))
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .leftJoin(schema.analyses, eq(schema.analyses.photoId, schema.photos.id))
    .where(secondWhere)
    .offset(secondOffset)
    .limit(1)

  if (!second) {
    throw new RatingServiceError(400, 'Not enough photos to compare')
  }

  return second
}

export async function submitComparisonVote(input: SubmitVoteInput) {
  const data = submitVoteSchema.parse(input)

  if (data.winnerPhotoId === data.loserPhotoId) {
    throw new RatingServiceError(400, 'Winner and loser must be different photos')
  }

  return db.transaction(async (tx) => {
    const winnerPhoto = await tx.query.photos.findFirst({
      where: eq(schema.photos.id, data.winnerPhotoId),
      columns: { id: true },
    })
    const loserPhoto = await tx.query.photos.findFirst({
      where: eq(schema.photos.id, data.loserPhotoId),
      columns: { id: true },
    })

    if (!winnerPhoto || !loserPhoto) {
      throw new RatingServiceError(404, 'Photo not found')
    }

    const winnerRating = await ensurePhotoRating(tx, winnerPhoto.id)
    const loserRating = await ensurePhotoRating(tx, loserPhoto.id)

    const beforeWinner = toSkillRating(winnerRating)
    const beforeLoser = toSkillRating(loserRating)
    const updated = updateRatingsForWin(beforeWinner, beforeLoser)
    const winnerDisplayRating = displayRating(updated.winner)
    const loserDisplayRating = displayRating(updated.loser)

    const [winnerAfter] = await tx
      .update(schema.photoRatings)
      .set({
        mu: updated.winner.mu,
        sigma: updated.winner.sigma,
        conservativeScore: conservativeScore(updated.winner),
        displayRating: winnerDisplayRating,
        winCount: sql`${schema.photoRatings.winCount} + 1`,
        comparisonCount: sql`${schema.photoRatings.comparisonCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.photoRatings.photoId, winnerPhoto.id))
      .returning()

    const [loserAfter] = await tx
      .update(schema.photoRatings)
      .set({
        mu: updated.loser.mu,
        sigma: updated.loser.sigma,
        conservativeScore: conservativeScore(updated.loser),
        displayRating: loserDisplayRating,
        lossCount: sql`${schema.photoRatings.lossCount} + 1`,
        comparisonCount: sql`${schema.photoRatings.comparisonCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.photoRatings.photoId, loserPhoto.id))
      .returning()

    const [comparison] = await tx
      .insert(schema.comparisons)
      .values({
        winnerPhotoId: winnerPhoto.id,
        loserPhotoId: loserPhoto.id,
        voterUserId: data.voterUserId ?? null,
        anonymousActorId: data.anonymousActorId ?? null,
        winnerMuBefore: beforeWinner.mu,
        winnerSigmaBefore: beforeWinner.sigma,
        loserMuBefore: beforeLoser.mu,
        loserSigmaBefore: beforeLoser.sigma,
        winnerMuAfter: updated.winner.mu,
        winnerSigmaAfter: updated.winner.sigma,
        loserMuAfter: updated.loser.mu,
        loserSigmaAfter: updated.loser.sigma,
        winnerDisplayRatingAfter: winnerDisplayRating,
        loserDisplayRatingAfter: loserDisplayRating,
        algorithm: RATING_ALGORITHM,
      })
      .returning({ id: schema.comparisons.id })

    const [stats] = await tx
      .insert(schema.siteStats)
      .values({
        id: 'global',
        totalComparisons: 1,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.siteStats.id,
        set: {
          totalComparisons: sql`${schema.siteStats.totalComparisons} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning({ totalComparisons: schema.siteStats.totalComparisons })

    return {
      comparisonId: comparison.id,
      winner: winnerAfter,
      loser: loserAfter,
      winnerDisplayRating,
      loserDisplayRating,
      totalComparisons: stats.totalComparisons,
    }
  })
}

const comparisonPhotoSelection = {
  photo: {
    id: schema.photos.id,
    imageUrl: schema.photos.imageUrl,
    name: sql<string | null>`coalesce(${schema.users.name}, ${schema.anonymousProfiles.name}, ${schema.photos.name})`,
    gender: schema.photos.gender,
    age: schema.photos.age,
    hairColor: schema.photos.hairColor,
    skinColor: schema.photos.skinColor,
    photoType: schema.photos.photoType,
    userId: schema.photos.userId,
    country: sql<string | null>`coalesce(${schema.users.country}, ${schema.anonymousProfiles.country})`,
    state: sql<string | null>`coalesce(${schema.users.state}, ${schema.anonymousProfiles.state})`,
  },
  rating: {
    displayRating: schema.photoRatings.displayRating,
    conservativeScore: schema.photoRatings.conservativeScore,
    winCount: schema.photoRatings.winCount,
    lossCount: schema.photoRatings.lossCount,
  },
  analysis: {
    pslScore: schema.analyses.pslScore,
  },
}

type ComparisonPhotoRow = {
  photo: {
    id: string
    imageUrl: string
    name: string | null
    gender: 'male' | 'female' | 'other'
    age: number | null
    hairColor: string | null
    skinColor: string | null
    photoType: 'face' | 'body' | 'outfit'
    userId: string | null
    country: string | null
    state: string | null
  }
  rating: {
    displayRating: number
    conservativeScore: number
    winCount: number
    lossCount: number
  } | null
  analysis: {
    pslScore: number | null
  } | null
}

function toComparisonPhoto(row: ComparisonPhotoRow) {
  return {
    id: row.photo.id,
    imageUrl: row.photo.imageUrl,
    name: row.photo.name,
    gender: row.photo.gender,
    age: row.photo.age,
    hairColor: row.photo.hairColor,
    skinColor: row.photo.skinColor,
    photoType: row.photo.photoType,
    userId: row.photo.userId,
    country: row.photo.country,
    state: row.photo.state,
    displayRating: row.rating?.displayRating ?? displayRating(initialSkillRating()),
    conservativeScore: row.rating?.conservativeScore ?? conservativeScore(initialSkillRating()),
    winCount: row.rating?.winCount ?? 0,
    lossCount: row.rating?.lossCount ?? 0,
    pslScore: row.analysis?.pslScore ?? null,
  }
}

function ageBucketFilter(ageBucket: Exclude<PairSelectionInput['ageBucket'], 'all'>) {
  if (ageBucket === '18-24') return sql`${schema.photos.age} between 18 and 24`
  if (ageBucket === '25-34') return sql`${schema.photos.age} between 25 and 34`
  if (ageBucket === '35-44') return sql`${schema.photos.age} between 35 and 44`
  return sql`${schema.photos.age} >= 45`
}

const regionCountries: Record<Exclude<PairSelectionInput['region'], 'global' | 'nearby'>, string[]> = {
  'north-america': ['CA', 'MX', 'US'],
  europe: ['AT', 'BE', 'CH', 'CZ', 'DE', 'DK', 'ES', 'FI', 'FR', 'GB', 'GR', 'IE', 'IT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SE', 'UA'],
  asia: ['AE', 'CN', 'HK', 'ID', 'IN', 'JP', 'KR', 'MY', 'PH', 'SG', 'TH', 'TW', 'VN'],
  'south-america': ['AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'PE', 'PY', 'UY', 'VE'],
  africa: ['DZ', 'EG', 'ET', 'GH', 'KE', 'MA', 'NG', 'TN', 'TZ', 'UG', 'ZA'],
  oceania: ['AU', 'FJ', 'NZ', 'PG'],
}

function regionFilter(params: PairSelectionInput): SQL | undefined {
  if (params.region === 'global') return undefined
  if (params.region !== 'nearby') {
    return inArray(sql<string>`coalesce(${schema.users.country}, ${schema.anonymousProfiles.country})`, regionCountries[params.region])
  }

  const latitude = params.latitude!
  const longitude = params.longitude!
  return sql`${schema.photos.latitude} is not null and ${schema.photos.longitude} is not null and
    6371 * acos(least(1, cos(radians(${latitude})) * cos(radians(${schema.photos.latitude})) *
    cos(radians(${schema.photos.longitude}) - radians(${longitude})) + sin(radians(${latitude})) *
    sin(radians(${schema.photos.latitude})))) <= ${params.radiusKm}`
}

function toSkillRating(rating: { mu: number; sigma: number }): SkillRating {
  return {
    mu: rating.mu,
    sigma: rating.sigma,
  }
}

async function ensurePhotoRating(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  photoId: string
) {
  const existing = await tx.query.photoRatings.findFirst({
    where: eq(schema.photoRatings.photoId, photoId),
  })

  if (existing) return existing

  const initial = initialSkillRating()
  const [created] = await tx
    .insert(schema.photoRatings)
    .values({
      photoId,
      algorithm: RATING_ALGORITHM,
      mu: initial.mu,
      sigma: initial.sigma,
      conservativeScore: conservativeScore(initial),
      displayRating: displayRating(initial),
    })
    .onConflictDoNothing()
    .returning()

  if (created) return created

  const recovered = await tx.query.photoRatings.findFirst({
    where: eq(schema.photoRatings.photoId, photoId),
  })

  if (!recovered) {
    throw new RatingServiceError(500, 'Failed to create photo rating')
  }

  return recovered
}
