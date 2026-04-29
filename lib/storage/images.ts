import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { env, isR2Configured } from '@/lib/env'
import { computeImageHash } from '@/lib/photos/imageHash'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const SUPPORTED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export const imageDataUrlSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith('data:image/'), 'Expected image data URL')

export type StoredImage = {
  imageUrl: string
  imageStorageKey: string
  imageHash: string
  contentType: keyof typeof SUPPORTED_MIME_TYPES
  sizeBytes: number
}

export class ImageStorageError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
  }
}

export async function storeImageDataUrl(imageDataUrl: string): Promise<StoredImage> {
  const parsed = parseImageDataUrl(imageDataUrl)
  const imageHash = computeImageHash(imageDataUrl)
  const extension = SUPPORTED_MIME_TYPES[parsed.contentType]
  const imageStorageKey = `${imageHash}.${extension}`
  const storedImage = isR2Configured()
    ? await storeR2Image(imageStorageKey, parsed)
    : await storeLocalImage(imageStorageKey, parsed)

  return {
    ...storedImage,
    imageHash,
  }
}

function parseImageDataUrl(imageDataUrl: string) {
  imageDataUrlSchema.parse(imageDataUrl)

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl)
  if (!match) {
    throw new ImageStorageError(400, 'Invalid image data URL')
  }

  const contentType = match[1] as keyof typeof SUPPORTED_MIME_TYPES
  if (!SUPPORTED_MIME_TYPES[contentType]) {
    throw new ImageStorageError(400, 'Unsupported image type')
  }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) {
    throw new ImageStorageError(400, 'Image is empty')
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new ImageStorageError(413, 'Image is too large')
  }

  return {
    contentType,
    buffer,
  }
}

async function storeLocalImage(
  imageStorageKey: string,
  parsed: ReturnType<typeof parseImageDataUrl>
): Promise<Omit<StoredImage, 'imageHash'>> {
  const storageDir = path.resolve(env.IMAGE_STORAGE_DIR || './public/uploads')
  const target = path.join(storageDir, imageStorageKey)

  await mkdir(storageDir, { recursive: true })
  await writeFile(target, parsed.buffer)

  const baseUrl = env.IMAGE_PUBLIC_BASE_URL || '/uploads'
  return {
    imageUrl: `${baseUrl.replace(/\/$/, '')}/${imageStorageKey}`,
    imageStorageKey,
    contentType: parsed.contentType,
    sizeBytes: parsed.buffer.byteLength,
  }
}

async function storeR2Image(
  imageStorageKey: string,
  parsed: ReturnType<typeof parseImageDataUrl>
): Promise<Omit<StoredImage, 'imageHash'>> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: imageStorageKey,
      Body: parsed.buffer,
      ContentType: parsed.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    })
  )

  const baseUrl = env.R2_PUBLIC_BASE_URL
  return {
    imageUrl: `${baseUrl!.replace(/\/$/, '')}/${imageStorageKey}`,
    imageStorageKey,
    contentType: parsed.contentType,
    sizeBytes: parsed.buffer.byteLength,
  }
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
