import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { env } from '@/lib/env'
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

export async function storeImageDataUrl(imageDataUrl: string): Promise<StoredImage> {
  const parsed = parseImageDataUrl(imageDataUrl)
  const imageHash = computeImageHash(imageDataUrl)
  const extension = SUPPORTED_MIME_TYPES[parsed.contentType]
  const imageStorageKey = `${imageHash}.${extension}`
  const storageDir = path.resolve(env.IMAGE_STORAGE_DIR || './public/uploads')
  const target = path.join(storageDir, imageStorageKey)

  await mkdir(storageDir, { recursive: true })
  await writeFile(target, parsed.buffer)

  const baseUrl = env.IMAGE_PUBLIC_BASE_URL || '/uploads'
  return {
    imageUrl: `${baseUrl.replace(/\/$/, '')}/${imageStorageKey}`,
    imageStorageKey,
    imageHash,
    contentType: parsed.contentType,
    sizeBytes: parsed.buffer.byteLength,
  }
}

function parseImageDataUrl(imageDataUrl: string) {
  imageDataUrlSchema.parse(imageDataUrl)

  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl)
  if (!match) {
    throw new Error('Invalid image data URL')
  }

  const contentType = match[1] as keyof typeof SUPPORTED_MIME_TYPES
  if (!SUPPORTED_MIME_TYPES[contentType]) {
    throw new Error('Unsupported image type')
  }

  const buffer = Buffer.from(match[2], 'base64')
  if (buffer.byteLength === 0) {
    throw new Error('Image is empty')
  }

  if (buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('Image is too large')
  }

  return {
    contentType,
    buffer,
  }
}

