import { and, eq, isNull } from 'drizzle-orm'
import { createHash } from 'crypto'
import { z } from 'zod'
import { hairColorSchema, normalizeApparentAge, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'

export const createPhotoRecordSchema = z.object({
  userId: z.string().min(1).nullable().optional(),
  anonymousActorId: z.string().min(1).nullable().optional(),
  photoSetId: z.string().min(1).nullable().optional(),
  personGroupId: z.string().min(1).nullable().optional(),
  imageUrl: z.string().refine((value) => value.startsWith('/') || z.url().safeParse(value).success, {
    message: 'Image URL must be absolute or a root-relative public path',
  }),
  imageStorageKey: z.string().min(1).nullable().optional(),
  imageHash: z.string().min(32).max(128),
  name: z.string().min(1).max(120).nullable().optional(),
  caption: z.string().max(500).nullable().optional(),
  gender: z.enum(['male', 'female', 'other']).optional().default('other'),
  age: z.number().int().min(18).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  skinColor: skinColorSchema.nullable().optional(),
  source: z.enum(['user', 'seeded', 'instagram']).optional().default('user'),
  photoType: z.enum(['face', 'body', 'outfit']).optional().default('face'),
  position: z.string().max(80).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isPublic: z.boolean().optional().default(false),
})

export type CreatePhotoRecordInput = z.input<typeof createPhotoRecordSchema>

export async function createPhotoRecord(input: CreatePhotoRecordInput) {
  const data = createPhotoRecordSchema.parse(input)

  const owner = data.userId
    ? eq(schema.photos.userId, data.userId)
    : and(isNull(schema.photos.userId), data.anonymousActorId
      ? eq(schema.photos.anonymousActorId, data.anonymousActorId)
      : isNull(schema.photos.anonymousActorId))
  const ownerKey = data.userId ? `user:${data.userId}` : data.anonymousActorId ? `anonymous:${data.anonymousActorId}` : null
  const imageHash = ownerKey ? createHash('sha256').update(`${ownerKey}:${data.imageHash}`).digest('hex') : data.imageHash
  // Retain the owner's historical records; never reuse another owner's identical upload.
  const find = (hash: string) => db.query.photos.findFirst({
    where: and(eq(schema.photos.imageHash, hash), owner),
    columns: {
      id: true,
      imageUrl: true,
      imageHash: true,
      isPublic: true,
    },
  })

  const existing = await find(data.imageHash) ?? await find(imageHash)
  if (existing) {
    return {
      photo: existing,
      deduped: true,
    }
  }

  const [photo] = await db
    .insert(schema.photos)
    .values({
      userId: data.userId ?? null,
      anonymousActorId: data.anonymousActorId ?? null,
      photoSetId: data.photoSetId ?? null,
      personGroupId: data.personGroupId ?? null,
      imageUrl: data.imageUrl,
      imageStorageKey: data.imageStorageKey ?? null,
      imageHash,
      name: data.name ?? null,
      caption: data.caption ?? null,
      gender: data.gender,
      age: normalizeApparentAge(data.age),
      hairColor: data.hairColor ?? null,
      skinColor: data.skinColor ?? null,
      source: data.source,
      photoType: data.photoType,
      position: data.position ?? null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      isPublic: data.isPublic,
    })
    .onConflictDoNothing({ target: schema.photos.imageHash })
    .returning({
      id: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      imageHash: schema.photos.imageHash,
      isPublic: schema.photos.isPublic,
    })

  if (photo) return { photo, deduped: false }
  const concurrent = await find(imageHash)
  if (!concurrent) throw new Error('Unable to save photo for this account')
  return { photo: concurrent, deduped: true }
}
