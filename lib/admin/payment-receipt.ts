import sharp from 'sharp'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'

export const paymentReceiptSchema = z.string().max(7_000_000).optional()

// Small, normalized receipts stay private in the database, behind admin access.
export async function normalizePaymentReceipt(image?: string) {
  if (!image) return null
  const match = image.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/)
  if (!match) throw new ApiError(400, 'Choose a JPG, PNG or WebP receipt')
  const bytes = Buffer.from(match[1], 'base64')
  if (bytes.length > 5 * 1024 * 1024) throw new ApiError(400, 'Receipt images must be under 5 MB')
  try {
    const receipt = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
    if (receipt.length > 1024 * 1024) throw new Error('Receipt too large')
    return receipt.toString('base64')
  } catch {
    throw new ApiError(400, 'Could not read the receipt image. Choose a smaller JPG, PNG or WebP.')
  }
}
