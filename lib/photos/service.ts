import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { hairColorSchema, skinColorSchema } from '@/lib/appearance/types'
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
  age: z.number().int().min(13).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  skinColor: skinColorSchema.nullable().optional(),
  source: z.enum(['user', 'seeded', 'instagram']).optional().default('user'),
  photoType: z.enum(['face', 'body', 'outfit']).optional().default('face'),
  position: z.string().max(80).nullable().optional(),
  isPublic: z.boolean().optional().default(true),
})

export type CreatePhotoRecordInput = z.input<typeof createPhotoRecordSchema>

export async function createPhotoRecord(input: CreatePhotoRecordInput) {
  const data = createPhotoRecordSchema.parse(input)

  const existing = await db.query.photos.findFirst({
    where: eq(schema.photos.imageHash, data.imageHash),
    columns: {
      id: true,
      imageUrl: true,
      imageHash: true,
    },
  })

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
      imageHash: data.imageHash,
      name: data.name ?? null,
      caption: data.caption ?? null,
      gender: data.gender,
      age: data.age ?? null,
      hairColor: data.hairColor ?? null,
      skinColor: data.skinColor ?? null,
      source: data.source,
      photoType: data.photoType,
      position: data.position ?? null,
      isPublic: data.isPublic,
    })
    .returning({
      id: schema.photos.id,
      imageUrl: schema.photos.imageUrl,
      imageHash: schema.photos.imageHash,
    })

  return {
    photo,
    deduped: false,
  }
}
