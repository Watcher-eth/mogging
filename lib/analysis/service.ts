import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

const pslScoreSchema = z.number().min(0).max(8)
const categoryScoreSchema = z.number().min(0).max(10)

export const saveAnalysisResultSchema = z.object({
  photoId: z.string().min(1),
  status: z.enum(['pending', 'processing', 'complete', 'failed']).default('complete'),
  pslScore: pslScoreSchema.nullable().optional(),
  harmonyScore: categoryScoreSchema.nullable().optional(),
  dimorphismScore: categoryScoreSchema.nullable().optional(),
  angularityScore: categoryScoreSchema.nullable().optional(),
  percentile: z.number().min(0).max(100).nullable().optional(),
  tier: z.string().max(120).nullable().optional(),
  tierDescription: z.string().max(500).nullable().optional(),
  metrics: z.record(z.string(), z.unknown()).default({}),
  landmarks: z.record(z.string(), z.unknown()).default({}),
  model: z.string().max(120).nullable().optional(),
  promptVersion: z.string().max(80).nullable().optional(),
  failureReason: z.string().max(500).nullable().optional(),
})

export type SaveAnalysisResultInput = z.infer<typeof saveAnalysisResultSchema>

export async function saveAnalysisResult(input: SaveAnalysisResultInput) {
  const data = saveAnalysisResultSchema.parse(input)

  const existing = await db.query.analyses.findFirst({
    where: eq(schema.analyses.photoId, data.photoId),
    columns: { id: true },
  })

  if (existing) {
    const [analysis] = await db
      .update(schema.analyses)
      .set({
        status: data.status,
        pslScore: data.pslScore ?? null,
        harmonyScore: data.harmonyScore ?? null,
        dimorphismScore: data.dimorphismScore ?? null,
        angularityScore: data.angularityScore ?? null,
        percentile: data.percentile ?? null,
        tier: data.tier ?? null,
        tierDescription: data.tierDescription ?? null,
        metrics: data.metrics,
        landmarks: data.landmarks,
        model: data.model ?? null,
        promptVersion: data.promptVersion ?? null,
        failureReason: data.failureReason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.analyses.id, existing.id))
      .returning()

    return { analysis, created: false }
  }

  const [analysis] = await db
    .insert(schema.analyses)
    .values({
      photoId: data.photoId,
      status: data.status,
      pslScore: data.pslScore ?? null,
      harmonyScore: data.harmonyScore ?? null,
      dimorphismScore: data.dimorphismScore ?? null,
      angularityScore: data.angularityScore ?? null,
      percentile: data.percentile ?? null,
      tier: data.tier ?? null,
      tierDescription: data.tierDescription ?? null,
      metrics: data.metrics,
      landmarks: data.landmarks,
      model: data.model ?? null,
      promptVersion: data.promptVersion ?? null,
      failureReason: data.failureReason ?? null,
    })
    .returning()

  return { analysis, created: true }
}
