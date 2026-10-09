import { z } from 'zod'
import registry from './rubric-registry.json'
import { hairColorSchema } from '@/lib/appearance/types'
import { protocolContextSchema, reportPotentialSchema } from '@/lib/analysis/schema'

const score = z.number().finite().min(0).max(10)
const point = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
export const webReportSchema = z.object({
  version: z.literal(2),
  summary: z.string().min(1).max(900),
  overallScore: score,
  categories: z.array(z.object({
    id: z.string(), score, explanation: z.string().min(1).max(700),
    recommendation: z.string().max(900).optional(),
  })).length(registry.categories.length).refine(categories => {
    const ids = new Set(categories.map(category => category.id))
    return ids.size === registry.categories.length && registry.categories.every(category => ids.has(category.id))
  }, 'Expected each web category exactly once'),
  entries: z.array(z.object({
    id: z.string(), value: z.union([z.number().finite(), z.array(z.number().finite()), z.string(), z.null()]),
    evidence: z.string(), source: z.enum(['llm-estimate', 'landmark-geometry', 'derived']),
    grade: score.nullable(), positions: z.array(z.number().min(0).max(1)).max(5).optional(),
  })),
  eyeColor: z.enum(['blue', 'gray', 'green', 'hazel', 'amber', 'brown', 'dark brown']).nullable(),
  hairColor: hairColorSchema.nullable(),
  // Per-photo paths in image coordinates; never fixture contours or guessed hidden features.
  contours: z.object({ hair: z.array(z.array(point).min(3).max(40)).max(3), ears: z.array(z.array(point).min(3).max(40)).max(2) }),
  timingMs: z.number().nonnegative(),
})
export type WebReport = z.infer<typeof webReportSchema>
export const webOverviewSchema = webReportSchema.omit({ version: true, entries: true, timingMs: true }).extend({
  faceDetected: z.boolean(),
  pslScore: z.number().min(1).max(8),
  harmonyScore: score, symmetryScore: score, proportionalityScore: score, averagenessScore: score,
  dimorphismScore: score, angularityScore: score,
  potential: reportPotentialSchema.optional(), protocolContext: protocolContextSchema.optional(),
})

// Providers may express outlines as one flat path or several paths, with object or tuple points.
// Normalize those equivalent encodings, then retain only valid visible image-coordinate paths.
export function parseWebOverview(value: unknown) {
  const raw = z.record(z.string(), z.unknown()).parse(value)
  const contours = raw.contours as Record<string, unknown> | undefined
  const paths = (value: unknown, maximum: number) => {
    if (!Array.isArray(value) || !value.length) return []
    const first = value[0]
    const flat = first && (typeof first.x === 'number' || (Array.isArray(first) && typeof first[0] === 'number'))
    return (flat ? [value] : value).flatMap(path => {
      if (!Array.isArray(path)) return []
      const normalized = path.map(item => Array.isArray(item) ? { x: item[0], y: item[1] } : item)
      const parsed = z.array(point).min(3).max(40).safeParse(normalized)
      return parsed.success ? [parsed.data] : []
    }).slice(0, maximum)
  }
  return webOverviewSchema.parse({ ...raw, contours: { hair: paths(contours?.hair, 3), ears: paths(contours?.ears, 2) } })
}
