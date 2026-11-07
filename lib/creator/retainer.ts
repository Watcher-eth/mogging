import { z } from 'zod'
import type { SprintTerms } from './sprints'

export const creatorRetainerSchema = z.object({
  id: z.string().uuid(),
  amountCents: z.number().int().positive().max(10_000_000),
  minimumTier1Percent: z.number().min(0).max(100),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
}).strict().refine(value => Date.parse(value.endsAt) > Date.parse(value.startsAt), 'Retainer must end after it starts')
export type CreatorRetainer = z.infer<typeof creatorRetainerSchema>

// Only new submissions consult the active agreement. Saved submission terms
// remain authoritative after expiry and on subsequent analytics reviews.
export function creatorRetainerTerms(terms: SprintTerms, agreement: CreatorRetainer | null | undefined, now = new Date()): SprintTerms {
  if (!agreement) return terms
  const parsed = creatorRetainerSchema.safeParse(agreement)
  if (!parsed.success || +now < Date.parse(parsed.data.startsAt) || +now >= Date.parse(parsed.data.endsAt)) return terms
  const retainer = parsed.data
  const maximum = Math.max(terms.maximumTier1Percent, retainer.minimumTier1Percent)
  return {
    ...terms,
    retainer,
    bonusBudgetCents: 0,
    minimumTier1Percent: retainer.minimumTier1Percent,
    maximumTier1Percent: maximum,
    milestones: [{ views: 0, amountCents: retainer.amountCents, audienceRates: [
      { audiencePercent: retainer.minimumTier1Percent, amountCents: retainer.amountCents },
      ...(maximum > retainer.minimumTier1Percent ? [{ audiencePercent: maximum, amountCents: retainer.amountCents }] : []),
    ] }],
  }
}
