import { and, eq, gt, isNull, inArray, desc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { creatorProfiles } from '@/lib/db/schema'
import { courseEnrollments, courses, courseSellers, courseAssets, courseProgress } from './schema'
import { progressSchema, type CourseLesson } from './validation'
import { videoPlayback, resourceDownload } from './providers'

export async function enrollment(userId: string, courseId: string) {
  return db.query.courseEnrollments.findFirst({ where: and(eq(courseEnrollments.userId, userId), eq(courseEnrollments.courseId, courseId), isNull(courseEnrollments.revokedAt), gt(courseEnrollments.expiresAt, new Date())) })
}
export async function lessonAccess(userId: string | null, courseId: string, lessonId: string, draft = false, admin = false) {
  const content = draft ? courses.draft : courses.published
  const [course] = await db.select({ id: courses.id, sellerId: courses.sellerId, status: courses.status, contentBlocked: courses.contentBlocked,
    lesson: sql<CourseLesson | null>`jsonb_path_query_first(${content}, '$.sections[*].lessons[*] ? (@.id == $id)', jsonb_build_object('id', ${lessonId}::text))`,
  }).from(courses).where(eq(courses.id, courseId)).limit(1)
  if (!course) throw new ApiError(404, 'Course not found')
  if (course.contentBlocked && !admin) throw new ApiError(403, 'Course content is unavailable')
  let owner = admin
  if (userId) {
    const [row] = await db.select({ userId: creatorProfiles.userId }).from(courseSellers).innerJoin(creatorProfiles, eq(courseSellers.creatorProfileId, creatorProfiles.id)).where(eq(courseSellers.id, course.sellerId)).limit(1)
    owner ||= row?.userId === userId
  }
  if (draft && !owner) throw new ApiError(403, 'Draft access requires course ownership')
  const lesson = course.lesson
  if (!lesson) throw new ApiError(404, 'Lesson not found')
  if (!owner && !(userId && await enrollment(userId, courseId))) {
    const seller = await db.query.courseSellers.findFirst({ where: eq(courseSellers.id, course.sellerId) })
    if (draft || !lesson.preview || course.status !== 'published' || seller?.status !== 'enabled') throw new ApiError(403, 'Purchase this course to access the lesson')
  }
  return { lesson, course }
}
export async function getLesson(userId: string | null, courseId: string, lessonId: string, draft = false, admin = false) {
  const { lesson } = await lessonAccess(userId, courseId, lessonId, draft, admin)
  const ids = [...lesson.resourceAssetIds, ...(lesson.videoAssetId ? [lesson.videoAssetId] : [])]
  const assets = ids.length ? await db.select().from(courseAssets).where(and(eq(courseAssets.courseId, courseId), inArray(courseAssets.id, ids), eq(courseAssets.state, 'ready'))) : []
  return { id: lesson.id, title: lesson.title, kind: lesson.kind, body: lesson.body, preview: lesson.preview, assets: assets.map(asset => ({ id: asset.id, title: asset.title, kind: asset.kind, contentType: asset.contentType, sizeBytes: asset.sizeBytes, durationSeconds: asset.durationSeconds })) }
}
export async function assetAccess(userId: string | null, courseId: string, lessonId: string, assetId: string, draft = false, admin = false) {
  const { lesson } = await lessonAccess(userId, courseId, lessonId, draft, admin)
  if (assetId !== lesson.videoAssetId && !lesson.resourceAssetIds.includes(assetId)) throw new ApiError(404, 'Asset not found in lesson')
  const asset = await db.query.courseAssets.findFirst({ where: and(eq(courseAssets.id, assetId), eq(courseAssets.courseId, courseId), eq(courseAssets.state, 'ready')) })
  if (!asset) throw new ApiError(404, 'Asset unavailable')
  return asset.kind === 'video' ? videoPlayback(asset.bunnyVideoId!) : resourceDownload(asset.storageKey!, asset.title)
}
export async function saveProgress(userId: string, courseId: string, lessonId: string, body: unknown) {
  await lessonAccess(userId, courseId, lessonId)
  if (!await enrollment(userId, courseId)) throw new ApiError(403, 'Enrollment required to save progress')
  const input = progressSchema.parse(body)
  const [progress] = await db.insert(courseProgress).values({ userId, courseId, lessonId, ...input }).onConflictDoUpdate({ target: [courseProgress.userId, courseProgress.courseId, courseProgress.lessonId], set: { ...input, updatedAt: new Date() } }).returning()
  return progress
}
export async function library(userId: string) {
  const rows = await db.select({ enrollment: courseEnrollments, id: courses.id, slug: courses.slug, content: courses.catalog, sellerSlug: courseSellers.slug }).from(courseEnrollments).innerJoin(courses, eq(courseEnrollments.courseId, courses.id)).innerJoin(courseSellers, eq(courses.sellerId, courseSellers.id)).where(eq(courseEnrollments.userId, userId)).orderBy(desc(courseEnrollments.createdAt)).limit(100)
  return rows.map(row => ({ ...row, content: row.content, active: !row.enrollment.revokedAt && row.enrollment.expiresAt.getTime() > Date.now() }))
}
