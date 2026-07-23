import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env, isR2Configured } from '@/lib/env'

export const MAX_CREATOR_VIDEO_BYTES = 500 * 1024 * 1024
export const MAX_CREATOR_ANALYTICS_VIDEO_BYTES = 250 * 1024 * 1024
export const MAX_CREATOR_SUBMISSION_ANALYTICS_BYTES = 10 * 1024 * 1024
export const CREATOR_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
export const CREATOR_ANALYTICS_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const CREATOR_CTA_LIBRARY_TYPES = ['video/mp4', 'image/png'] as const
export const MAX_CREATOR_CTA_LIBRARY_BYTES = 100 * 1024 * 1024
export type CreatorVideoType = (typeof CREATOR_VIDEO_TYPES)[number]
export type CreatorAnalyticsImageType = (typeof CREATOR_ANALYTICS_IMAGE_TYPES)[number]
export type CreatorCtaLibraryType = (typeof CREATOR_CTA_LIBRARY_TYPES)[number]

const extensions: Record<CreatorVideoType, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
}

const analyticsImageExtensions: Record<CreatorAnalyticsImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export async function createCreatorVideoUpload(userId: string, contentType: CreatorVideoType, sizeBytes: number) {
  const key = `creators/${userId}/${crypto.randomUUID()}.${extensions[contentType]}`
  return createVideoUpload(key, contentType, sizeBytes)
}

export async function createCreatorAccountAnalyticsUpload(userId: string, contentType: CreatorVideoType, sizeBytes: number) {
  const key = `creators/${userId}/account-analytics/${crypto.randomUUID()}.${extensions[contentType]}`
  return createVideoUpload(key, contentType, sizeBytes)
}

export async function createCreatorSubmissionAnalyticsUpload(userId: string, contentType: CreatorAnalyticsImageType, sizeBytes: number) {
  const key = `creators/${userId}/submission-analytics/${crypto.randomUUID()}.${analyticsImageExtensions[contentType]}`
  return createAssetUpload(key, contentType, sizeBytes, `/api/creator/submission-analytics?key=${encodeURIComponent(key)}`)
}

export async function createCreatorCtaLibraryUpload(userId: string, contentType: CreatorCtaLibraryType, sizeBytes: number) {
  const extension = contentType === 'video/mp4' ? 'mp4' : 'png'
  const key = `creators/${userId}/cta-library/${crypto.randomUUID()}.${extension}`
  const fallbackUploadUrl = `/api/creator/cta-library/asset?key=${encodeURIComponent(key)}`
  return {
    ...(await createAssetUpload(key, contentType, sizeBytes, fallbackUploadUrl)),
    fallbackUploadUrl,
  }
}

export function creatorAssetPublicUrl(key: string) {
  return isR2Configured()
    ? `${env.R2_PUBLIC_BASE_URL!.replace(/\/$/, '')}/${key}`
    : `${(env.IMAGE_PUBLIC_BASE_URL || '/uploads').replace(/\/$/, '')}/${key}`
}

async function createVideoUpload(key: string, contentType: CreatorVideoType, sizeBytes: number) {
  return createAssetUpload(key, contentType, sizeBytes, `/api/creator/video?key=${encodeURIComponent(key)}`)
}

async function createAssetUpload(key: string, contentType: string, sizeBytes: number, localUploadUrl: string) {
  const publicUrl = creatorAssetPublicUrl(key)

  if (!isR2Configured()) {
    return { key, publicUrl, uploadUrl: localUploadUrl, method: 'POST' as const }
  }

  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
    ContentLength: sizeBytes,
  })
  const uploadUrl = await getSignedUrl(getR2Client(), command, { expiresIn: 600 })
  return { key, publicUrl, uploadUrl, method: 'PUT' as const }
}

export async function storeLocalCreatorVideo(key: string, body: Buffer) {
  const storageDir = path.resolve(env.IMAGE_STORAGE_DIR || './public/uploads')
  const target = path.resolve(storageDir, key)
  if (!target.startsWith(`${storageDir}${path.sep}`)) throw new Error('Invalid upload path')
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, body)
}

export async function storeCreatorAsset(key: string, body: Buffer, contentType: string) {
  if (!isR2Configured()) return storeLocalCreatorVideo(key, body)
  await getR2Client().send(new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
    ContentLength: body.byteLength,
  }))
}

let r2Client: S3Client | null = null
function getR2Client() {
  if (r2Client) return r2Client
  r2Client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  })
  return r2Client
}
