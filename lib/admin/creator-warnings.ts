import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { CREATOR_WARNING_OPTIONS, creatorWarningOption } from './creator-score-policy'
import { reconcileCreatorScoresInTransaction } from './creator-score-service'

const categorySchema = z.enum(CREATOR_WARNING_OPTIONS.map(option => option.id))

export const addCreatorWarningSchema = z.object({
  creatorProfileId: z.string().trim().min(1).max(120),
  note: z.string().trim().min(3).max(1000),
  category: categorySchema.optional(),
  submissionId: z.string().min(1).max(120).optional(),
})

export const addCreatorWarningsSchema = z.object({
  creatorProfileId: z.string().trim().min(1).max(120),
  categories: z.array(categorySchema).min(1).max(CREATOR_WARNING_OPTIONS.length).refine(values => new Set(values).size === values.length, 'Duplicate warning categories'),
  submissionId: z.string().min(1).max(120).optional(),
  note: z.string().trim().max(1000).default(''),
}).refine(input => !input.categories.includes('other') || input.note.length >= 3, 'Describe the internal note')
  .refine(input => !input.categories.includes('missing_bio_link') || Boolean(input.submissionId), 'Bio-link checks require a submission and posting account')

export const resolveCreatorWarningSchema = z.object({ id: z.string().trim().min(1).max(120) })

export async function listCreatorInternalWarnings(creatorId?: string) {
  return db.select().from(schema.creatorInternalWarnings).where(creatorId ? eq(schema.creatorInternalWarnings.creatorProfileId, creatorId) : undefined).orderBy(desc(schema.creatorInternalWarnings.createdAt))
}

export async function addCreatorInternalWarning(input: z.infer<typeof addCreatorWarningSchema>, adminEmail: string) {
  const warnings = await addCreatorInternalWarnings({ creatorProfileId: input.creatorProfileId, categories: [input.category || 'other'], note: input.note, submissionId: input.submissionId }, adminEmail)
  return warnings[0]
}

export async function addCreatorInternalWarnings(input: z.infer<typeof addCreatorWarningsSchema>, adminEmail: string) {
  input = addCreatorWarningsSchema.parse(input)
  return db.transaction(async tx => {
    // Same ordering as the score writer avoids lock inversions between concurrent reviewers.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('creator-score-history-v1', 0))`)
    const [creator] = await tx.select({ id: schema.creatorProfiles.id }).from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, input.creatorProfileId)).for('update')
    if (!creator) throw new ApiError(404, 'Creator not found')
    if (input.submissionId) {
      const submission = await tx.query.creatorSubmissions.findFirst({ where: and(eq(schema.creatorSubmissions.id, input.submissionId), eq(schema.creatorSubmissions.creatorProfileId, creator.id), eq(schema.creatorSubmissions.isDraft, false)) })
      if (!submission) throw new ApiError(400, 'Submission does not belong to this creator')
      if (input.categories.includes('missing_bio_link') && !submission.socialAccountId) throw new ApiError(400, 'Bio-link checks require a connected posting account')
    }
    // Capture an exact before-state even if this creator has never appeared in the rankings.
    await reconcileCreatorScoresInTransaction(tx, 'Before warning change', adminEmail)
    const active = await tx.select().from(schema.creatorInternalWarnings).where(and(eq(schema.creatorInternalWarnings.creatorProfileId, creator.id), isNull(schema.creatorInternalWarnings.resolvedAt)))
    const categories = input.categories.filter(category => category === 'other' || !active.some(warning => warning.category === category && (warning.submissionId || null) === (input.submissionId || null)))
    if (!categories.length) throw new ApiError(409, 'These warnings are already active for this submission or creator')
    const warnings = await tx.insert(schema.creatorInternalWarnings).values(categories.map(category => ({ creatorProfileId: creator.id, category, penaltyPoints: creatorWarningOption(category)!.points, submissionId: input.submissionId || null, note: input.note.trim() || creatorWarningOption(category)!.label, createdByEmail: adminEmail }))).returning()
    await reconcileCreatorScoresInTransaction(tx, `Warning added: ${categories.map(category => creatorWarningOption(category)!.label).join('; ')}`, adminEmail)
    return warnings
  })
}

export async function resolveCreatorInternalWarning(input: z.infer<typeof resolveCreatorWarningSchema>, adminEmail: string) {
  return db.transaction(async tx => {
    await reconcileCreatorScoresInTransaction(tx, 'Before warning resolution', adminEmail)
    const [warning] = await tx.update(schema.creatorInternalWarnings).set({ resolvedAt: new Date(), resolvedByEmail: adminEmail }).where(and(eq(schema.creatorInternalWarnings.id, input.id), isNull(schema.creatorInternalWarnings.resolvedAt))).returning()
    if (!warning) throw new ApiError(404, 'Active warning not found')
    await reconcileCreatorScoresInTransaction(tx, `Warning resolved: ${creatorWarningOption(warning.category)?.label || 'Internal note'}`, adminEmail)
    return warning
  })
}
