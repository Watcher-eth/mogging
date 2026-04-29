import { z } from 'zod'

export const metricCategorySchema = z.enum([
  'symmetry',
  'proportionality',
  'averageness',
  'dimorphism',
  'angularity',
  'skin',
  'presentation',
  'harmony',
  'misc',
])

export const metricScoreSchema = z.object({
  name: z.string(),
  score: z.number().min(0).max(8),
  category: metricCategorySchema,
  description: z.string().optional(),
})

export const analysisProviderResultSchema = z.object({
  faceDetected: z.boolean(),
  harmonyScore: z.number().min(0).max(8),
  symmetryScore: z.number().min(0).max(8).nullable().optional(),
  proportionalityScore: z.number().min(0).max(8).nullable().optional(),
  averagenessScore: z.number().min(0).max(8).nullable().optional(),
  dimorphismScore: z.number().min(0).max(8),
  angularityScore: z.number().min(0).max(8),
  metricScores: z.array(metricScoreSchema).default([]),
  percentile: z.number().min(0).max(100).nullable().optional(),
  tier: z.string().nullable().optional(),
  tierDescription: z.string().nullable().optional(),
  landmarks: z.record(z.string(), z.unknown()).default({}),
})

export type MetricCategory = z.infer<typeof metricCategorySchema>
export type AnalysisProviderResult = z.infer<typeof analysisProviderResultSchema>

export type AnalyzeFaceInput = {
  imageDataUrl: string
  gender: 'male' | 'female' | 'other'
}

export type AnalysisProvider = {
  model: string
  analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult>
}
