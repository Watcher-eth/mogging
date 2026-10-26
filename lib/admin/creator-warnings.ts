import { and, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'

export const addCreatorWarningSchema = z.object({
  creatorProfileId: z.string().trim().min(1).max(120),
  note: z.string().trim().min(3).max(1000),
})

export const resolveCreatorWarningSchema = z.object({ id: z.string().trim().min(1).max(120) })

export async function listCreatorInternalWarnings() {
  return db.select().from(schema.creatorInternalWarnings).orderBy(desc(schema.creatorInternalWarnings.createdAt))
}

export async function addCreatorInternalWarning(input: z.infer<typeof addCreatorWarningSchema>, adminEmail: string) {
  const creator = await db.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, input.creatorProfileId) })
  if (!creator) throw new ApiError(404, 'Creator not found')
  const [warning] = await db.insert(schema.creatorInternalWarnings).values({
    creatorProfileId: input.creatorProfileId,
    note: input.note.trim(),
    createdByEmail: adminEmail,
  }).returning()
  return warning
}

export async function resolveCreatorInternalWarning(input: z.infer<typeof resolveCreatorWarningSchema>, adminEmail: string) {
  const [warning] = await db.update(schema.creatorInternalWarnings).set({ resolvedAt: new Date(), resolvedByEmail: adminEmail }).where(and(eq(schema.creatorInternalWarnings.id, input.id), isNull(schema.creatorInternalWarnings.resolvedAt))).returning()
  if (!warning) throw new ApiError(404, 'Active warning not found')
  return warning
}
