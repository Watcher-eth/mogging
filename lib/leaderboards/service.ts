import { and, count, desc, eq, ilike, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { conservativeScore, displayRating, initialSkillRating } from '@/lib/ratings/trueskill'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 25

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
})

export const photoLeaderboardQuerySchema = paginationSchema.extend({
  gender: z.enum(['male', 'female', 'other', 'all']).default('all'),
  photoType: z.enum(['face', 'body', 'outfit', 'all']).default('all'),
  sort: z.enum(['rating', 'display', 'psl', 'recent']).default('rating'),
  q: z.string().trim().max(120).optional(),
})

export const pslLeaderboardQuerySchema = paginationSchema.extend({
  gender: z.enum(['male', 'female', 'other', 'all']).default('all'),
  q: z.string().trim().max(120).optional(),
})

export const userLeaderboardQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(120).optional(),
})

export type PhotoLeaderboardQuery = z.infer<typeof photoLeaderboardQuerySchema>
export type PslLeaderboardQuery = z.infer<typeof pslLeaderboardQuerySchema>
export type UserLeaderboardQuery = z.infer<typeof userLeaderboardQuerySchema>

const initialRating = initialSkillRating()
const initialConservativeScore = conservativeScore(initialRating)
const initialDisplayRating = displayRating(initialRating)

export async function getPhotoLeaderboard(input: PhotoLeaderboardQuery) {
  const query = photoLeaderboardQuerySchema.parse(input)
  const offset = (query.page - 1) * query.limit
  const where = and(...photoFilters(query))

  const [{ total }] = await db.select({ total: count() }).from(schema.photos).where(where)
  const rows = await db
    .select({
      id: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      name: schema.photos.name,
      gender: schema.photos.gender,
      photoType: schema.photos.photoType,
      userId: schema.photos.userId,
      createdAt: schema.photos.createdAt,
      displayRating: sql<number>`coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating})`,
      conservativeScore: sql<number>`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})`,
      winCount: sql<number>`coalesce(${schema.photoRatings.winCount}, 0)`,
      lossCount: sql<number>`coalesce(${schema.photoRatings.lossCount}, 0)`,
      comparisonCount: sql<number>`coalesce(${schema.photoRatings.comparisonCount}, 0)`,
      pslScore: schema.analyses.pslScore,
    })
    .from(schema.photos)
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .leftJoin(schema.analyses, eq(schema.analyses.photoId, schema.photos.id))
    .where(where)
    .orderBy(photoSort(query.sort))
    .limit(query.limit)
    .offset(offset)

  return paginated(query, total, rows.map((row, index) => ({ rank: offset + index + 1, ...row })))
}

export async function getCurrentUserPhotoRank(userId: string) {
  const [bestPhoto] = await db
    .select({
      id: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      name: schema.photos.name,
      gender: schema.photos.gender,
      photoType: schema.photos.photoType,
      userId: schema.photos.userId,
      createdAt: schema.photos.createdAt,
      displayRating: sql<number>`coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating})`,
      conservativeScore: sql<number>`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})`,
      winCount: sql<number>`coalesce(${schema.photoRatings.winCount}, 0)`,
      lossCount: sql<number>`coalesce(${schema.photoRatings.lossCount}, 0)`,
      comparisonCount: sql<number>`coalesce(${schema.photoRatings.comparisonCount}, 0)`,
      pslScore: schema.analyses.pslScore,
    })
    .from(schema.photos)
    .innerJoin(schema.analyses, eq(schema.analyses.photoId, schema.photos.id))
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .where(and(
      eq(schema.photos.userId, userId),
      eq(schema.photos.isPublic, true),
      eq(schema.analyses.status, 'complete')
    ))
    .orderBy(desc(sql`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})`))
    .limit(1)

  if (!bestPhoto) {
    return {
      entry: null,
    }
  }

  const [{ higherCount }] = await db
    .select({
      higherCount: count(schema.photos.id),
    })
    .from(schema.photos)
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .where(and(
      eq(schema.photos.isPublic, true),
      sql`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore}) > ${bestPhoto.conservativeScore}`
    ))

  return {
    entry: {
      rank: higherCount + 1,
      ...bestPhoto,
    },
  }
}

export async function getPslLeaderboard(input: PslLeaderboardQuery) {
  const query = pslLeaderboardQuerySchema.parse(input)
  const offset = (query.page - 1) * query.limit
  const filters = [
    eq(schema.photos.isPublic, true),
    eq(schema.analyses.status, 'complete'),
    query.gender === 'all' ? undefined : eq(schema.photos.gender, query.gender),
    query.q ? ilike(schema.photos.name, `%${query.q}%`) : undefined,
  ].filter(Boolean)
  const where = and(...filters)

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.analyses)
    .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
    .where(where)

  const rows = await db
    .select({
      analysisId: schema.analyses.id,
      photoId: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      name: schema.photos.name,
      gender: schema.photos.gender,
      userId: schema.photos.userId,
      pslScore: schema.analyses.pslScore,
      harmonyScore: schema.analyses.harmonyScore,
      dimorphismScore: schema.analyses.dimorphismScore,
      angularityScore: schema.analyses.angularityScore,
      percentile: schema.analyses.percentile,
      tier: schema.analyses.tier,
      createdAt: schema.analyses.createdAt,
    })
    .from(schema.analyses)
    .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
    .where(where)
    .orderBy(desc(sql`coalesce(${schema.analyses.pslScore}, 0)`), desc(schema.analyses.createdAt))
    .limit(query.limit)
    .offset(offset)

  return paginated(query, total, rows.map((row, index) => ({ rank: offset + index + 1, ...row })))
}

export async function getUserLeaderboard(input: UserLeaderboardQuery) {
  const query = userLeaderboardQuerySchema.parse(input)
  const offset = (query.page - 1) * query.limit
  const userFilters = [query.q ? ilike(schema.users.name, `%${query.q}%`) : undefined].filter(Boolean)
  const userWhere = userFilters.length > 0 ? and(...userFilters) : undefined

  const [{ total }] = await db
    .select({ total: count() })
    .from(schema.users)
    .where(
      userWhere
        ? and(
            userWhere,
            sql`exists (
              select 1 from ${schema.photos}
              where ${schema.photos.userId} = ${schema.users.id}
              and ${schema.photos.isPublic} = true
            )`
          )
        : sql`exists (
            select 1 from ${schema.photos}
            where ${schema.photos.userId} = ${schema.users.id}
            and ${schema.photos.isPublic} = true
          )`
    )

  const score = sql<number>`
    (0.70 * max(coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore}))
    + 0.30 * avg(coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})))
  `

  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      image: schema.users.image,
      verified: schema.users.verified,
      photoCount: count(schema.photos.id),
      bestConservativeScore: sql<number>`max(coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore}))`,
      averageConservativeScore: sql<number>`avg(coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore}))`,
      leaderboardScore: score,
      bestDisplayRating: sql<number>`max(coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating}))`,
    })
    .from(schema.users)
    .innerJoin(schema.photos, eq(schema.photos.userId, schema.users.id))
    .leftJoin(schema.photoRatings, eq(schema.photoRatings.photoId, schema.photos.id))
    .where(and(eq(schema.photos.isPublic, true), ...(userWhere ? [userWhere] : [])))
    .groupBy(schema.users.id)
    .orderBy(desc(score), desc(sql`count(${schema.photos.id})`))
    .limit(query.limit)
    .offset(offset)

  return paginated(query, total, rows.map((row, index) => ({ rank: offset + index + 1, ...row })))
}

function paginated<TItem>(
  query: { page: number; limit: number },
  total: number,
  items: TItem[]
) {
  return {
    page: query.page,
    limit: query.limit,
    total,
    items,
  }
}

function photoFilters(query: PhotoLeaderboardQuery): SQL[] {
  return [
    eq(schema.photos.isPublic, true),
    query.gender === 'all' ? undefined : eq(schema.photos.gender, query.gender),
    query.photoType === 'all' ? undefined : eq(schema.photos.photoType, query.photoType),
    query.q ? ilike(schema.photos.name, `%${query.q}%`) : undefined,
  ].filter(Boolean) as SQL[]
}

function photoSort(sort: PhotoLeaderboardQuery['sort']) {
  if (sort === 'display') return desc(sql`coalesce(${schema.photoRatings.displayRating}, ${initialDisplayRating})`)
  if (sort === 'psl') return desc(sql`coalesce(${schema.analyses.pslScore}, 0)`)
  if (sort === 'recent') return desc(schema.photos.createdAt)
  return desc(sql`coalesce(${schema.photoRatings.conservativeScore}, ${initialConservativeScore})`)
}
