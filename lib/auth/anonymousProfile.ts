import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { hairColorSchema, skinColorSchema } from '@/lib/appearance/types'
import { db, schema } from '@/lib/db'
import { storeImageDataUrl } from '@/lib/storage/images'

export const anonymousProfileSchema = z.object({
  name: z.string().trim().min(1).max(100),
  imageData: z.string().startsWith('data:image/').nullable().optional(),
  social: z
    .string()
    .trim()
    .max(160)
    .transform((value) => value || null)
    .nullable()
    .optional(),
  gender: z.enum(['male', 'female']).nullable().optional(),
  age: z.coerce.number().int().min(13).max(120).nullable().optional(),
  hairColor: hairColorSchema.nullable().optional(),
  skinColor: skinColorSchema.nullable().optional(),
})

export type AnonymousProfileInput = z.infer<typeof anonymousProfileSchema>
export type AnonymousProfile = Awaited<ReturnType<typeof getAnonymousProfile>>

export async function getAnonymousProfile(anonymousActorId: string) {
  return db.query.anonymousProfiles.findFirst({
    where: eq(schema.anonymousProfiles.anonymousActorId, anonymousActorId),
  })
}

export async function upsertAnonymousProfile(anonymousActorId: string, input: AnonymousProfileInput) {
  const data = anonymousProfileSchema.parse(input)
  const storedAvatar = data.imageData ? await storeImageDataUrl(data.imageData) : null

  const [profile] = await db
    .insert(schema.anonymousProfiles)
    .values({
      anonymousActorId,
      image: storedAvatar?.imageUrl ?? null,
      name: data.name,
      social: data.social ?? null,
      gender: data.gender ?? null,
      age: data.age ?? null,
      hairColor: data.hairColor ?? null,
      skinColor: data.skinColor ?? null,
    })
    .onConflictDoUpdate({
      target: schema.anonymousProfiles.anonymousActorId,
      set: {
        ...(storedAvatar ? { image: storedAvatar.imageUrl } : null),
        name: data.name,
        social: data.social ?? null,
        gender: data.gender ?? null,
        age: data.age ?? null,
        hairColor: data.hairColor ?? null,
        skinColor: data.skinColor ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  return profile
}
