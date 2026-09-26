import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { finishEvaluation, lockEvaluationReservation } from '@/lib/payments/entitlements'

import { pslScoreSchema } from './schema'

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

export async function saveAnalysisResult(input: SaveAnalysisResultInput, scan?: {
  id: string
  photo: Record<string, unknown>
  deduped: boolean
}) {
  const data = saveAnalysisResultSchema.parse(input)

  return db.transaction(async tx => {
    if (scan) await lockEvaluationReservation(tx, scan.id)
    const values = {
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
    }
    const [analysis] = await tx.insert(schema.analyses).values(values)
      .onConflictDoUpdate({ target: schema.analyses.photoId, set: { ...values, updatedAt: new Date() } })
      .returning()

    if (scan) await finishEvaluation(scan.id, { photo: scan.photo, analysis, deduped: scan.deduped }, data.status === 'complete', tx)
    return { analysis }
  })
}
