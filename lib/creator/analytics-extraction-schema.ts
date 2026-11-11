import { z } from 'zod'

export const countrySchema = z.object({ code: z.string().regex(/^[A-Z]{2}$/), percent: z.number().min(0).max(100),
  precision: z.number().int().min(0).max(2), frameIds: z.array(z.string()).min(1) })
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const percent = z.number().min(0).max(100)
const baseExtractionSchema = z.object({
  scope: z.enum(['post_viewers', 'account_viewers', 'followers', 'unknown']),
  countries: z.array(countrySchema).max(100), otherPercent: z.number().min(0).max(100).nullable(),
  issues: z.array(z.string()).max(20),
  averageWatchTimeSeconds: z.number().nonnegative().nullable(), totalViewers: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
  dropOffTimeSeconds: z.number().nonnegative().nullable(),
  totalViews: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(), totalViewsExact: z.boolean(),
  age: z.array(z.object({ range: z.string(), percent })).max(10),
})

const extraMetrics = {
  totalPlayTimeSeconds: z.number().nonnegative().nullish(),
  watchedFullVideoPercent: percent.nullish(),
  newFollowers: count.nullish(),
  postSummary: z.object({
    postedAtLabel: z.string().max(100).nullish(),
    likes: count.nullish(), comments: count.nullish(), shares: count.nullish(), saves: count.nullish(),
  }).nullish(),
  totalViewersChange: z.object({
    count: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
    comparisonLabel: z.string().min(1).max(80),
  }).nullish(),
  viewerTypes: z.object({
    newViewersPercent: percent.nullish(), returningViewersPercent: percent.nullish(),
    nonFollowersPercent: percent.nullish(), followersPercent: percent.nullish(),
  }).nullish(),
  gender: z.array(z.object({ label: z.enum(['Male', 'Female', 'Other']), percent })).max(3)
    .refine(rows => new Set(rows.map(row => row.label)).size === rows.length).optional(),
}

export const extractionSchema = baseExtractionSchema.extend(extraMetrics)

export function parseAnalyticsExtraction(data: unknown) {
  const base = baseExtractionSchema.parse(data)
  // A malformed optional field must not discard a usable country reading or another metric.
  const raw = data as Record<string, unknown>
  const metrics = Object.fromEntries(Object.entries(extraMetrics).flatMap(([name, schema]) => {
    const parsed = schema.safeParse(raw[name])
    return parsed.success && parsed.data !== undefined ? [[name, parsed.data]] : []
  })) as z.infer<z.ZodObject<typeof extraMetrics>>
  return { ...base, ...metrics }
}
