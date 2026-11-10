import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'
import { conservativeScore, displayRating, initialSkillRating } from '@/lib/ratings/trueskill'
import { db, schema } from '@/lib/db'

const { users, memberPublicProfiles, photos, analyses, photoRatings } = schema
const initialRating = initialSkillRating()

export async function getMemberVisibility(userId: string) {
  const [listing] = await db.select({ userId: memberPublicProfiles.userId }).from(memberPublicProfiles)
    .where(eq(memberPublicProfiles.userId, userId)).limit(1)
  return { isPublic: Boolean(listing) }
}

export async function setMemberVisibility(userId: string, isPublic: boolean) {
  if (isPublic) {
    await db.insert(memberPublicProfiles).values({ userId }).onConflictDoNothing()
  } else {
    await db.delete(memberPublicProfiles).where(eq(memberPublicProfiles.userId, userId))
  }
  return { isPublic }
}

export async function getMemberLeaderboard(page: number, limit: number, { gender = 'all', viewerId, battle = false }: { gender?: 'all' | 'female' | 'male'; viewerId?: string; battle?: boolean } = {}) {
  // An opt-in shares the display name and score. Only the legacy photo publication permits a portrait.
  const webScore = sql`case when jsonb_typeof(${analyses.metrics}->'webReportV2'->'overallScore') = 'number'
    then (${analyses.metrics}->'webReportV2'->>'overallScore')::numeric end`
  const score = sql<number>`(case when ${webScore} between 0 and 10 then ${webScore}
    when ${analyses.pslScore} between 0 and 8 then ${analyses.pslScore} * 1.25 end)::real`.as('score')
  const identity = sql`case when ${photos.userId} is null then 'photo:' || ${photos.id} else 'member:' || ${photos.userId} end`
  const name = sql<string | null>`case when ${memberPublicProfiles.userId} is not null then ${users.name} else ${photos.name} end`.as('display_name')
  const imageUrl = sql<string | null>`case when ${photos.isPublic} then ${photos.imageUrl} else (
    select published.image_url from photos as published
    where published.user_id = ${photos.userId} and published.photo_type = 'face' and published.is_public = true
    order by published.created_at desc, published.id desc limit 1
  ) end`.as('public_image')
  const rating = sql<number | null>`case when ${photos.isPublic} then coalesce(${photoRatings.displayRating}, ${displayRating(initialRating)})::integer end`.as('battle_rating')
  const strength = sql<number | null>`case when ${photos.isPublic} then coalesce(${photoRatings.conservativeScore}, ${conservativeScore(initialRating)})::real end`.as('battle_strength')
  const latest = db.selectDistinctOn([identity], { userId: photos.userId, photoId: photos.id, gender: photos.gender, score, name,
    imageUrl,
    rating: battle ? rating : sql<number | null>`null`.as('battle_rating'),
    strength: battle ? strength : sql<number | null>`null`.as('battle_strength'),
  })
    .from(photos).leftJoin(memberPublicProfiles, eq(memberPublicProfiles.userId, photos.userId))
    .leftJoin(users, eq(users.id, photos.userId))
    .innerJoin(analyses, eq(analyses.photoId, photos.id))
    .$dynamic()
  if (battle) latest.leftJoin(photoRatings, eq(photoRatings.photoId, photos.id))
  const ranked = latest.where(and(eq(photos.photoType, 'face'), eq(analyses.status, 'complete'),
      or(isNotNull(memberPublicProfiles.userId), eq(photos.isPublic, true)),
      sql`${analyses.metrics}->>'presentation' IS DISTINCT FROM 'face-study'`,
      viewerId ? sql`(${photos.userId} = ${viewerId} or exists (
        select 1 from referral_signups
        where (inviter_user_id = ${viewerId} and referred_user_id = ${photos.userId})
           or (referred_user_id = ${viewerId} and inviter_user_id = ${photos.userId})
      ))` : undefined))
    .orderBy(identity, desc(analyses.createdAt), desc(analyses.id)).as('latest')
  const offset = (page - 1) * limit
  const rows = await db.select({ name: ranked.name, score: ranked.score, userId: ranked.userId,
    imageUrl: ranked.imageUrl, rating: ranked.rating,
  }).from(ranked).where(and(sql`${ranked.score} IS NOT NULL`, gender !== 'all' ? eq(ranked.gender, gender) : undefined))
    .orderBy(...(battle ? [sql`${ranked.strength} desc nulls last`] : []), desc(ranked.score), ranked.photoId)
    .limit(limit + 1).offset(offset)
  return {
    items: rows.slice(0, limit).map((row, index) => ({
      rank: offset + index + 1, name: row.name?.trim() || 'Mogging member', score: row.score, ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}), ...(battle ? { rating: row.rating } : {}), ...(viewerId === row.userId ? { isViewer: true } : {}),
    })),
    hasMore: rows.length > limit,
  }
}

export async function exportMemberData(userId: string) {
  const [account, visibility, evaluations] = await Promise.all([
    db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { id: true, name: true, email: true, image: true, instagramUsername: true, gender: true,
        age: true, bio: true, country: true, state: true, hairColor: true, skinColor: true, createdAt: true },
    }),
    getMemberVisibility(userId),
    db.select({
      photoId: photos.id, imageUrl: photos.imageUrl, photoType: photos.photoType, position: photos.position,
      capturedAt: photos.createdAt, evaluationId: analyses.id, evaluatedAt: analyses.createdAt,
      status: analyses.status, pslScore: analyses.pslScore, landmarks: analyses.landmarks,
      report: sql<unknown>`${analyses.metrics}->'report'`, webReport: sql<unknown>`${analyses.metrics}->'webReportV2'`,
    }).from(photos).leftJoin(analyses, eq(analyses.photoId, photos.id))
      .where(eq(photos.userId, userId)).orderBy(desc(photos.createdAt), desc(photos.id)),
  ])
  return account ? { exportedAt: new Date().toISOString(), account, visibility, evaluations } : null
}
