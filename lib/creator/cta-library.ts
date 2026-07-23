import { desc, eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { getCreatorProfile, getOrCreateCreatorProfile } from '@/lib/creator/service'
import { creatorAssetPublicUrl, CREATOR_CTA_LIBRARY_TYPES, MAX_CREATOR_CTA_LIBRARY_BYTES } from '@/lib/storage/videos'

export const creatorCtaLibrarySubmissionSchema = z.object({
  title: z.string().trim().min(2).max(100),
  templateId: z.enum(['editorial', 'score-potential', 'psl', 'score-rows', 'cta']),
  formatId: z.enum(['vertical', 'portrait', 'square']),
  assetStorageKey: z.string().min(1),
  assetContentType: z.enum(CREATOR_CTA_LIBRARY_TYPES),
  assetSizeBytes: z.number().int().positive().max(MAX_CREATOR_CTA_LIBRARY_BYTES),
})

export const creatorCtaLibraryReviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['pending', 'approved', 'rejected']),
  reviewNote: z.string().trim().max(1000).optional().nullable(),
})

export type CreatorCtaLibraryStatus = 'pending' | 'approved' | 'rejected'
export type CreatorCtaLibraryItem = {
  id: string
  creatorProfileId: string
  creatorName: string
  title: string
  templateId: string
  formatId: string
  assetUrl: string
  assetContentType: string
  assetSizeBytes: number
  status: CreatorCtaLibraryStatus
  reviewNote: string | null
  reviewedAt: string | Date | null
  createdAt: string | Date
}

export async function getCreatorCtaLibrary(userId: string) {
  const profile = await getCreatorProfile(userId)
  const [approved, mine] = await Promise.all([
    selectLibraryItems(eq(schema.creatorCtaLibraryItems.status, 'approved')),
    profile ? selectLibraryItems(eq(schema.creatorCtaLibraryItems.creatorProfileId, profile.id)) : Promise.resolve([]),
  ])
  return { approved, mine }
}

export async function createCreatorCtaLibraryItem(userId: string, input: z.infer<typeof creatorCtaLibrarySubmissionSchema>) {
  if (!input.assetStorageKey.startsWith(`creators/${userId}/cta-library/`)) {
    throw new ApiError(400, 'Invalid CTA library upload')
  }
  const profile = await getOrCreateCreatorProfile(userId)
  const [item] = await db.insert(schema.creatorCtaLibraryItems).values({
    creatorProfileId: profile.id,
    title: input.title,
    templateId: input.templateId,
    formatId: input.formatId,
    assetUrl: creatorAssetPublicUrl(input.assetStorageKey),
    assetStorageKey: input.assetStorageKey,
    assetContentType: input.assetContentType,
    assetSizeBytes: input.assetSizeBytes,
  }).returning()
  return item
}

export function getAdminCtaLibrary() {
  return selectLibraryItems()
}

export async function reviewCreatorCtaLibraryItem(input: z.infer<typeof creatorCtaLibraryReviewSchema>, reviewerEmail: string) {
  const now = new Date()
  const [item] = await db.update(schema.creatorCtaLibraryItems).set({
    status: input.status,
    reviewNote: input.reviewNote || null,
    reviewedByEmail: reviewerEmail,
    reviewedAt: now,
    updatedAt: now,
  }).where(eq(schema.creatorCtaLibraryItems.id, input.id)).returning()
  if (!item) throw new ApiError(404, 'CTA library item not found')
  return item
}

function selectLibraryItems(where?: SQL) {
  const query = db.select({
    id: schema.creatorCtaLibraryItems.id,
    creatorProfileId: schema.creatorCtaLibraryItems.creatorProfileId,
    creatorName: schema.creatorProfiles.displayName,
    title: schema.creatorCtaLibraryItems.title,
    templateId: schema.creatorCtaLibraryItems.templateId,
    formatId: schema.creatorCtaLibraryItems.formatId,
    assetUrl: schema.creatorCtaLibraryItems.assetUrl,
    assetContentType: schema.creatorCtaLibraryItems.assetContentType,
    assetSizeBytes: schema.creatorCtaLibraryItems.assetSizeBytes,
    status: schema.creatorCtaLibraryItems.status,
    reviewNote: schema.creatorCtaLibraryItems.reviewNote,
    reviewedAt: schema.creatorCtaLibraryItems.reviewedAt,
    createdAt: schema.creatorCtaLibraryItems.createdAt,
  }).from(schema.creatorCtaLibraryItems).innerJoin(schema.creatorProfiles, eq(schema.creatorCtaLibraryItems.creatorProfileId, schema.creatorProfiles.id))
  return (where ? query.where(where) : query).orderBy(desc(schema.creatorCtaLibraryItems.createdAt))
}
