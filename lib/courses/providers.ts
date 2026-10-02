import { createHash } from 'node:crypto'
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ApiError } from '@/lib/api/http'
import { env } from '@/lib/env'

export function bunnyConfig() {
  const libraryId = env.BUNNY_STREAM_LIBRARY_ID, key = env.BUNNY_STREAM_API_KEY
  if (!libraryId || !key || !env.BUNNY_STREAM_TOKEN_KEY) throw new ApiError(503, 'Course video hosting is not configured')
  return { libraryId, key, tokenKey: env.BUNNY_STREAM_TOKEN_KEY }
}
export type BunnyVideo = { guid: string; videoLibraryId: number; status: number; length: number; storageSize: number }
export async function bunny<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const { libraryId, key } = bunnyConfig()
  const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos${path}`, {
    method, headers: { AccessKey: key, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15_000),
  })
  if (method === 'DELETE' && (response.ok || response.status === 404)) return undefined as T
  if (!response.ok) throw new ApiError(502, 'Video provider request failed', 'provider_error')
  return response.json() as Promise<T>
}
export function videoUploadHeaders(videoId: string, expires: number) {
  const { libraryId, key } = bunnyConfig()
  return { AuthorizationSignature: createHash('sha256').update(`${libraryId}${key}${expires}${videoId}`).digest('hex'), AuthorizationExpire: String(expires), LibraryId: libraryId, VideoId: videoId }
}
export function videoPlayback(videoId: string) {
  const { libraryId, tokenKey } = bunnyConfig(), expires = Math.floor(Date.now() / 1000) + 900
  const token = createHash('sha256').update(`${tokenKey}${videoId}${expires}`).digest('hex')
  return { url: `https://player.mediadelivery.net/embed/${libraryId}/${videoId}?token=${token}&expires=${expires}`, expiresAt: new Date(expires * 1000).toISOString() }
}
let storage: S3Client | undefined
function r2() {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.COURSE_R2_BUCKET_NAME) throw new ApiError(503, 'Private course storage is not configured')
  if (env.COURSE_R2_BUCKET_NAME === env.R2_BUCKET_NAME) throw new ApiError(503, 'Course resources need a separate private bucket')
  storage ??= new S3Client({ region: 'auto', endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY } })
  return { client: storage, Bucket: env.COURSE_R2_BUCKET_NAME }
}
export async function resourceUpload(key: string, type: string, size: number) {
  const { client, Bucket } = r2()
  return getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: type, ContentLength: size }), { expiresIn: 900 })
}
export async function resourceHead(key: string) { const { client, Bucket } = r2(); return client.send(new HeadObjectCommand({ Bucket, Key: key })) }
export async function resourceDownload(key: string, title: string) {
  const { client, Bucket } = r2()
  return { url: await getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key, ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(title)}`, ResponseContentType: 'application/octet-stream' }), { expiresIn: 300 }), expiresAt: new Date(Date.now() + 300_000).toISOString() }
}
export async function resourceDelete(key: string) { const { client, Bucket } = r2(); await client.send(new DeleteObjectCommand({ Bucket, Key: key })) }
