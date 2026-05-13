import { and, count, desc, eq, ilike, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { hairColorSchema, normalizeApparentAge, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'
import { conservativeScore, displayRating, initialSkillRating } from '@/lib/ratings/trueskill'
import { storeImageDataUrl } from '@/lib/storage/images'

const RECENT_PHOTO_LIMIT = 12
const SEARCH_LIMIT = 20

const initialRating = initialSkillRating()
const initialConservativeScore = conservativeScore(initialRating)
const initialDisplayRating = displayRating(initialRating)

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).nullable().optional(),
  bio: z.string().trim().max(500).nullable().optional(),
  imageData: z.string().startsWith('data:image/').nullable().optional(),
  instagramUsername: z
    .string()
    .trim()
    .max(160)
    .transform((value) => normalizeSocialValue(value))
    .nullable()
    .optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  age: z.coerce.number().int().min(18).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  skinColor: skinColorSchema.nullable().optional(),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
  state: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .nullable()
    .optional(),
})

export const searchUsersSchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().min(1).max(50).default(SEARCH_LIMIT),
})

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>
export type SearchUsersInput = z.infer<typeof searchUsersSchema>

export class UserServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function getPublicUserProfile(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: publicUserQueryColumns,
  })

  if (!user) {
    throw new UserServiceError(404, 'User not found')
  }

  const [stats, bestPhoto, recentPhotos] = await Promise.all([
    getUserStats(user.id),
    getBestPublicPhoto(user.id),
    getRecentPublicPhotos(user.id, RECENT_PHOTO_LIMIT),
  ])

  return {
    user,
    stats,
    bestPhoto,
    recentPhotos,
  }
}

export async function getCurrentUserDashboard(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: publicUserQueryColumns,
  })

  if (!user) {
    throw new UserServiceError(404, 'User not found')
  }

  const [stats, bestPhoto, recentPhotos, recentAnalyses] = await Promise.all([
    getUserStats(user.id),
    getBestPublicPhoto(user.id),
    getRecentPublicPhotos(user.id, RECENT_PHOTO_LIMIT),
    getRecentAnalyses(user.id, 10),
  ])

  return {
    user,
    stats,
    bestPhoto,
    recentPhotos,
    recentAnalyses,
  }
}

export async function updateUserProfile(userId: string, input: UpdateUserProfileInput) {
  const data = updateUserProfileSchema.parse(input)
  const storedAvatar = data.imageData ? await storeImageDataUrl(data.imageData) : null
  const [user] = await db
    .update(schema.users)
    .set({
      ...(data.name !== undefined ? { name: data.name } : null),
      ...(data.bio !== undefined ? { bio: data.bio } : null),
      ...(storedAvatar ? { image: storedAvatar.imageUrl } : null),
      ...(data.instagramUsername !== undefined ? { instagramUsername: data.instagramUsername || null } : null),
      ...(data.gender !== undefined ? { gender: data.gender } : null),
      ...(data.age !== undefined ? { age: normalizeApparentAge(data.age) } : null),
      ...(data.hairColor !== undefined ? { hairColor: data.hairColor } : null),
      ...(data.skinColor !== undefined ? { skinColor: data.skinColor } : null),
      ...(data.country !== undefined ? { country: data.country } : null),
      ...(data.state !== undefined ? { state: data.state } : null),
      profileCompleted: true,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId))
    .returning(publicUserReturningFields)

  if (!user) {
    throw new UserServiceError(404, 'User not found')
  }

  return user
}

export async function updateUserAvatarIfMissing(userId: string, imageUrl: string) {
  await db
    .update(schema.users)
    .set({
      image: imageUrl,
      updatedAt: new Date(),
    })
    .where(and(
      eq(schema.users.id, userId),
      isNull(schema.users.image)
    ))
}

export async function searchUsers(input: SearchUsersInput) {
  const query = searchUsersSchema.parse(input)
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      image: schema.users.image,
      verified: schema.users.verified,
      publicPhotoCount: count(schema.photos.id),
      bestDisplayRating: sql<number>`max(coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating}))`,
    })
    .from(schema.users)
    .leftJoin(schema.photos, and(eq(schema.photos.userId, schema.users.id), eq(schema.photos.isPublic, true)))
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .where(ilike(schema.users.name, `%${query.q}%`))
    .groupBy(schema.users.id)
    .orderBy(desc(sql`max(coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore}))`))
    .limit(query.limit)

  return { items: rows }
}

const publicUserQueryColumns = {
  id: true,
  name: true,
  image: true,
  instagramUsername: true,
  gender: true,
  age: true,
  hairColor: true,
  skinColor: true,
  bio: true,
  country: true,
  state: true,
  profileCompleted: true,
  verified: true,
  verifiedAt: true,
  createdAt: true,
} as const

const publicUserReturningFields = {
  id: schema.users.id,
  name: schema.users.name,
  image: schema.users.image,
  instagramUsername: schema.users.instagramUsername,
  gender: schema.users.gender,
  age: schema.users.age,
  hairColor: schema.users.hairColor,
  skinColor: schema.users.skinColor,
  bio: schema.users.bio,
  country: schema.users.country,
  state: schema.users.state,
  profileCompleted: schema.users.profileCompleted,
  verified: schema.users.verified,
  verifiedAt: schema.users.verifiedAt,
  createdAt: schema.users.createdAt,
}

async function getUserStats(userId: string) {
  const [photoStats, analysisStats, comparisonStats] = await Promise.all([
    db
      .select({
        publicPhotos: count(schema.photos.id),
        bestDisplayRating: sql<number>`max(coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating}))`,
        bestConservativeScore: sql<number>`max(coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore}))`,
        totalWins: sql<number>`coalesce(sum(${schema.photoRatings.winCount}), 0)`,
        totalLosses: sql<number>`coalesce(sum(${schema.photoRatings.lossCount}), 0)`,
      })
      .from(schema.photos)
      .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
      .where(and(eq(schema.photos.userId, userId), eq(schema.photos.isPublic, true))),
    db
      .select({ analyses: count(schema.analyses.id) })
      .from(schema.analyses)
      .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .where(eq(schema.photos.userId, userId)),
    db
      .select({ comparisons: count(schema.comparisons.id) })
      .from(schema.comparisons)
      .where(eq(schema.comparisons.voterUserId, userId)),
  ])

  return {
    publicPhotos: photoStats[0]?.publicPhotos ?? 0,
    analyses: analysisStats[0]?.analyses ?? 0,
    comparisons: comparisonStats[0]?.comparisons ?? 0,
    bestDisplayRating: photoStats[0]?.bestDisplayRating ?? null,
    bestConservativeScore: photoStats[0]?.bestConservativeScore ?? null,
    totalWins: Number(photoStats[0]?.totalWins ?? 0),
    totalLosses: Number(photoStats[0]?.totalLosses ?? 0),
  }
}

async function getBestPublicPhoto(userId: string) {
  const [photo] = await db
    .select(publicPhotoSelection)
    .from(schema.photos)
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .leftJoin(schema.analyses, eq(schema.analyses.photoId, schema.photos.id))
    .where(and(eq(schema.photos.userId, userId), eq(schema.photos.isPublic, true)))
    .orderBy(desc(sql`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})`))
    .limit(1)

  return photo ? normalizePublicPhoto(photo) : null
}

async function getRecentPublicPhotos(userId: string, limit: number) {
  const rows = await db
    .select(publicPhotoSelection)
    .from(schema.photos)
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .leftJoin(schema.analyses, eq(schema.analyses.photoId, schema.photos.id))
    .where(and(eq(schema.photos.userId, userId), eq(schema.photos.isPublic, true)))
    .orderBy(desc(schema.photos.createdAt))
    .limit(limit)

  return rows.map(normalizePublicPhoto)
}

async function getRecentAnalyses(userId: string, limit: number) {
  return db
    .select({
      id: schema.analyses.id,
      photoId: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      pslScore: schema.analyses.pslScore,
      status: schema.analyses.status,
      createdAt: schema.analyses.createdAt,
    })
    .from(schema.analyses)
    .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
    .where(eq(schema.photos.userId, userId))
    .orderBy(desc(schema.analyses.createdAt))
    .limit(limit)
}

const publicPhotoSelection = {
  id: schema.photos.id,
  imageUrl: schema.photos.imageUrl,
  name: schema.photos.name,
  caption: schema.photos.caption,
  gender: schema.photos.gender,
  photoType: schema.photos.photoType,
  createdAt: schema.photos.createdAt,
  displayRating: sql<number>`coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating})`,
  conservativeScore: sql<number>`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})`,
  winCount: sql<number>`coalesce(${schema.photoRatings.winCount}, 0)`,
  lossCount: sql<number>`coalesce(${schema.photoRatings.lossCount}, 0)`,
  pslScore: schema.analyses.pslScore,
}

function normalizePublicPhoto<TPhoto>(photo: TPhoto) {
  return photo
}

function normalizeSocialValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''

  if (/^https?:\/\/(www\.)?instagram\.com\//i.test(trimmed)) {
    return trimmed.replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '')
  }

  if (/^https?:\/\/(www\.)?tiktok\.com\//i.test(trimmed)) {
    return trimmed
  }

  return trimmed.replace(/^@/, '')
}
