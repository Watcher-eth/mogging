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
  score: z.number().min(0).max(10),
  category: metricCategorySchema,
  description: z.string().optional(),
})

export const reportFeatureSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(160),
})

export const reportCategorySchema = z.object({
  id: z.enum([
    'eyes',
    'nose',
    'mouth',
    'jaw',
    'dimorphism',
    'face-shape',
    'biological-age',
    'symmetry',
    'overall',
  ]),
  title: z.string().min(1).max(80),
  subtitle: z.string().min(1).max(180),
  scoreLabel: z.string().min(1).max(80),
  score: z.number().min(0).max(10),
  features: z.array(reportFeatureSchema).min(2).max(6),
  explanation: z.string().min(1).max(700),
})

export const analysisReportSchema = z.object({
  summary: z.string().min(1).max(900),
  categories: z.array(reportCategorySchema).min(9).max(9),
})

export const analysisProviderResultSchema = z.object({
  faceDetected: z.boolean(),
  pslScore: z.number().min(0).max(8).nullable().optional(),
  harmonyScore: z.number().min(0).max(10),
  symmetryScore: z.number().min(0).max(10).nullable().optional(),
  proportionalityScore: z.number().min(0).max(10).nullable().optional(),
  averagenessScore: z.number().min(0).max(10).nullable().optional(),
  dimorphismScore: z.number().min(0).max(10),
  angularityScore: z.number().min(0).max(10),
  metricScores: z.array(metricScoreSchema).default([]),
  percentile: z.number().min(0).max(100).nullable().optional(),
  tier: z.string().nullable().optional(),
  tierDescription: z.string().nullable().optional(),
  report: analysisReportSchema.nullable().optional(),
  landmarks: z.record(z.string(), z.unknown()).default({}),
})

export type MetricCategory = z.infer<typeof metricCategorySchema>
export type AnalysisReport = z.infer<typeof analysisReportSchema>
export type AnalysisProviderResult = z.infer<typeof analysisProviderResultSchema>

export type AnalyzeFaceInput = {
  imageDataUrl: string
  gender: 'male' | 'female' | 'other'
}

export type AnalysisProvider = {
  model: string
  analyzeFace(input: AnalyzeFaceInput): Promise<AnalysisProviderResult>
}
