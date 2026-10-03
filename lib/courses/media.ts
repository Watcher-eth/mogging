import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/api/http'
import { courseAssets, courses, courseSellers } from './schema'
import { ownedCourse } from './catalog'
import { uploadSchema, assetIdsOf } from './validation'
import { bunny, bunnyConfig, courseStorage, videoUploadHeaders, videoThumbnailUrl, resourceUpload, resourceHead, resourceDelete, type BunnyVideo } from './providers'

export async function startUpload(userId: string, courseId: string, body: unknown) {
  const input = uploadSchema.parse(body), { seller } = await ownedCourse(userId, courseId)
  if (seller.status !== 'enabled') throw new ApiError(403, 'Seller approval is required before uploading media')
  if (input.kind === 'video') bunnyConfig()
  else courseStorage()
  const asset = await db.transaction(async tx => {
    await tx.select().from(courseSellers).where(eq(courseSellers.id, seller.id)).for('update')
    const [{ seconds, bytes, count }] = await tx.select({ seconds: sql<number>`coalesce(sum(case when ${courseAssets.kind} = 'video' then ${courseAssets.durationSeconds} else 0 end), 0)::float8`, bytes: sql<number>`coalesce(sum(case when ${courseAssets.kind} = 'resource' then ${courseAssets.sizeBytes} else 0 end), 0)::float8`, count: sql<number>`count(*)::int` }).from(courseAssets).innerJoin(courses, eq(courseAssets.courseId, courses.id)).where(and(eq(courses.sellerId, seller.id), ne(courseAssets.state, 'deleted')))
    if (count >= 1000 || seconds + (input.kind === 'video' ? input.durationSeconds : 0) > env.COURSE_VIDEO_QUOTA_SECONDS || bytes + (input.kind === 'resource' ? input.sizeBytes : 0) > env.COURSE_RESOURCE_QUOTA_BYTES) throw new ApiError(409, 'Seller upload quota reached')
    const id = crypto.randomUUID()
    const [created] = await tx.insert(courseAssets).values({ ...input, id, courseId, storageKey: input.kind === 'resource' ? `courses/${courseId}/${id}` : null, uploadExpiresAt: new Date(Date.now() + (input.kind === 'video' ? 3600_000 : 900_000)) }).returning()
    return created
  })
  try {
    if (input.kind === 'video') {
      const video = await bunny<BunnyVideo>('', 'POST', { title: asset.id })
      const expires = Math.floor(asset.uploadExpiresAt.getTime() / 1000), { libraryId } = bunnyConfig()
      await db.update(courseAssets).set({ bunnyVideoId: video.guid, bunnyLibraryId: libraryId }).where(eq(courseAssets.id, asset.id))
      return { assetId: asset.id, endpoint: 'https://video.bunnycdn.com/tusupload', protocol: 'tus', headers: videoUploadHeaders(video.guid, expires), metadata: { filetype: input.contentType, title: input.title }, expiresAt: asset.uploadExpiresAt }
    }
    return { assetId: asset.id, protocol: 'put', url: await resourceUpload(asset.storageKey!, asset.contentType, asset.sizeBytes), headers: { 'Content-Type': input.contentType }, expiresAt: asset.uploadExpiresAt }
  } catch (error) {
    await db.update(courseAssets).set({ state: 'failed', updatedAt: new Date() }).where(eq(courseAssets.id, asset.id))
    throw error
  }
}
export async function syncAsset(asset: typeof courseAssets.$inferSelect) {
  if (asset.state === 'deleted') return asset
  if (asset.kind === 'resource') {
    if (!asset.storageKey) throw new ApiError(409, 'Upload was not initialized')
    const head = await resourceHead(asset.storageKey)
    if (head.ContentLength !== asset.sizeBytes || head.ContentType !== asset.contentType) {
      await resourceDelete(asset.storageKey)
      await db.update(courseAssets).set({ state: 'failed', updatedAt: new Date() }).where(eq(courseAssets.id, asset.id))
      throw new ApiError(400, 'Uploaded resource does not match the reserved file')
    }
    const [updated] = await db.update(courseAssets).set({ state: 'ready', updatedAt: new Date() }).where(and(eq(courseAssets.id, asset.id), ne(courseAssets.state, 'deleted'))).returning()
    return updated
  }
  if (!asset.bunnyVideoId) throw new ApiError(409, 'Upload was not initialized')
  const video = await bunny<BunnyVideo>(`/${asset.bunnyVideoId}`)
  // REST VideoModelStatus differs from the Status values in webhook notifications.
  if (String(video.videoLibraryId) !== asset.bunnyLibraryId || video.guid !== asset.bunnyVideoId) throw new ApiError(502, 'Video provider identity mismatch')
  if (video.status === 4 && (!Number.isFinite(video.length) || video.length <= 0 || video.length > asset.durationSeconds || video.length > 7200 || !Number.isSafeInteger(video.storageSize) || video.storageSize <= 0 || video.storageSize > 10 * 1024 ** 3)) {
    await bunny(`/${asset.bunnyVideoId}`, 'DELETE')
    await db.update(courseAssets).set({ state: 'failed', updatedAt: new Date() }).where(eq(courseAssets.id, asset.id))
    throw new ApiError(400, 'Video exceeds its reserved duration or storage limit')
  }
  const [updated] = await db.update(courseAssets).set({ state: video.status === 4 ? 'ready' : video.status === 5 || video.status === 6 ? 'failed' : 'processing', ...(video.status === 4 ? { durationSeconds: video.length, sizeBytes: video.storageSize } : {}), updatedAt: new Date() }).where(and(eq(courseAssets.id, asset.id), ne(courseAssets.state, 'deleted'))).returning()
  return updated
}
export async function finishUpload(userId: string, courseId: string, assetId: string) {
  await ownedCourse(userId, courseId)
  const asset = await db.query.courseAssets.findFirst({ where: and(eq(courseAssets.id, assetId), eq(courseAssets.courseId, courseId)) })
  if (!asset || asset.state === 'deleted') throw new ApiError(404, 'Asset not found')
  return syncAsset(asset)
}
export async function resumeUpload(userId: string, courseId: string, assetId: string, body: unknown) {
  const { seller } = await ownedCourse(userId, courseId)
  if (seller.status !== 'enabled') throw new ApiError(403, 'Seller approval is required before uploading media')
  const input = uploadSchema.parse(body)
  const asset = await db.query.courseAssets.findFirst({ where: and(eq(courseAssets.id, assetId), eq(courseAssets.courseId, courseId)) })
  if (!asset || asset.state !== 'pending') throw new ApiError(409, 'This upload cannot be resumed; choose a replacement file')
  if (asset.kind === 'video' ? !asset.bunnyVideoId : !asset.storageKey) throw new ApiError(409, 'Upload initialization is incomplete; choose a replacement file')
  if (input.kind !== asset.kind || input.title !== asset.title || input.contentType !== asset.contentType || input.sizeBytes !== asset.sizeBytes || input.kind === 'video' && input.durationSeconds !== asset.durationSeconds) throw new ApiError(400, 'Choose the original file to resume this upload')
  const expiresAt = new Date(Date.now() + (asset.kind === 'video' ? 3600_000 : 900_000))
  const ticket = asset.kind === 'video'
    ? { assetId, protocol: 'tus', endpoint: 'https://video.bunnycdn.com/tusupload', headers: videoUploadHeaders(asset.bunnyVideoId!, Math.floor(expiresAt.getTime() / 1000)), metadata: { filetype: asset.contentType, title: asset.title }, expiresAt }
    : { assetId, protocol: 'put', url: await resourceUpload(asset.storageKey!, asset.contentType, asset.sizeBytes), headers: { 'Content-Type': asset.contentType }, expiresAt }
  await db.update(courseAssets).set({ uploadExpiresAt: expiresAt, updatedAt: new Date() }).where(and(eq(courseAssets.id, assetId), eq(courseAssets.state, 'pending')))
  return ticket
}
export async function deleteAsset(userId: string, courseId: string, assetId: string) {
  await ownedCourse(userId, courseId)
  const asset = await db.transaction(async tx => {
    const [course] = await tx.select().from(courses).where(eq(courses.id, courseId)).for('update')
    if (assetIdsOf(course.draft).includes(assetId) || (course.published && assetIdsOf(course.published).includes(assetId))) throw new ApiError(409, 'Remove the asset from draft and published lessons before deleting it')
    const [deleted] = await tx.update(courseAssets).set({ state: 'deleted', updatedAt: new Date() }).where(and(eq(courseAssets.id, assetId), eq(courseAssets.courseId, courseId))).returning()
    if (!deleted) throw new ApiError(404, 'Asset not found')
    return deleted
  })
  await purgeAsset(asset)
}
export async function purgeAsset(asset: typeof courseAssets.$inferSelect) {
  if (asset.bunnyVideoId) await bunny(`/${asset.bunnyVideoId}`, 'DELETE')
  if (asset.storageKey) await resourceDelete(asset.storageKey)
  await db.update(courseAssets).set({ bunnyVideoId: null, storageKey: null, updatedAt: new Date() }).where(and(eq(courseAssets.id, asset.id), eq(courseAssets.state, 'deleted')))
}
export async function assetsForCourse(courseId: string) {
  const rows = await db.select().from(courseAssets).where(and(eq(courseAssets.courseId, courseId), inArray(courseAssets.state, ['pending', 'processing', 'ready', 'failed'])))
  const stale = rows.filter(asset => asset.kind === 'video' && asset.state === 'processing' && asset.updatedAt.getTime() < Date.now() - 10_000).sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime()).slice(0, 4)
  const refreshed = await Promise.allSettled(stale.map(syncAsset))
  for (const result of refreshed) if (result.status === 'fulfilled' && result.value) {
    const index = rows.findIndex(asset => asset.id === result.value.id)
    rows[index] = result.value
  }
  return rows
}
export async function assetThumbnail(userId: string, courseId: string, assetId: string) {
  await ownedCourse(userId, courseId)
  const asset = await db.query.courseAssets.findFirst({ where: and(eq(courseAssets.id, assetId), eq(courseAssets.courseId, courseId), eq(courseAssets.kind, 'video'), eq(courseAssets.state, 'ready')) })
  if (!asset?.bunnyVideoId) throw new ApiError(404, 'Video thumbnail is unavailable')
  return videoThumbnailUrl(asset.bunnyVideoId)
}
