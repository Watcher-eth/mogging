import { z } from 'zod'
import type { CreatorSubmissionFormat } from './formats'

const paragraph = z.string().trim().min(1).max(2000)
export const sprintTermsSchema = z
  .object({
    milestones: z
      .array(
        z.object({
          views: z.number().int().positive().max(2_000_000_000),
          amountCents: z.number().int().positive().max(10_000_000),
          audienceRates: z
            .array(
              z.object({
                audiencePercent: z.number().min(0).max(100),
                amountCents: z.number().int().nonnegative().max(10_000_000),
              }),
            )
            .min(1)
            .max(41)
            .optional(),
        }),
      )
      .min(1)
      .max(12),
    minimumTier1Percent: z.number().min(0).max(100),
    maximumTier1Percent: z.number().positive().max(100),
    submissionWindowHours: z.number().positive().max(720),
    rules: z.array(paragraph).min(1).max(20),
    formats: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(80),
          name: paragraph,
          shortDescription: paragraph,
          active: z.boolean().default(true),
          elements: z
            .array(z.object({ title: paragraph, detail: paragraph }))
            .min(1)
            .max(6),
          requirements: z.array(paragraph).min(1).max(12),
          notAllowed: z.array(paragraph).max(12),
        }),
      )
      .min(1)
      .max(8),
    platforms: z
      .array(z.enum(['tiktok', 'instagram']))
      .min(1)
      .max(2),
  })
  .superRefine((value, ctx) => {
    for (const milestone of value.milestones) {
      const rates = milestone.audienceRates
      if (!rates) continue
      if (
        rates[0].audiencePercent !== value.minimumTier1Percent ||
        rates.at(-1)!.audiencePercent !== value.maximumTier1Percent ||
        rates.at(-1)!.amountCents !== milestone.amountCents ||
        rates.some(
          (rate, i) =>
            i > 0 &&
            (rate.audiencePercent <= rates[i - 1].audiencePercent ||
              rate.amountCents < rates[i - 1].amountCents),
        )
      ) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Audience rates must increase from the minimum to maximum audience, ending at the advertised payout',
        })
      }
    }
    if (value.minimumTier1Percent > value.maximumTier1Percent)
      ctx.addIssue({
        code: 'custom',
        message: 'Minimum audience cannot exceed maximum audience',
      })
    if (
      new Set(value.formats.map((item) => item.id)).size !==
      value.formats.length
    )
      ctx.addIssue({ code: 'custom', message: 'Format IDs must be unique' })
    if (new Set(value.platforms).size !== value.platforms.length)
      ctx.addIssue({ code: 'custom', message: 'Platforms must be unique' })
    for (let i = 1; i < value.milestones.length; i++)
      if (
        value.milestones[i].views <= value.milestones[i - 1].views ||
        value.milestones[i].amountCents < value.milestones[i - 1].amountCents
      )
        ctx.addIssue({
          code: 'custom',
          message:
            'Milestones must increase in views and never decrease in payout',
        })
  })
export const sprintInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2).max(120),
    description: paragraph,
    status: z.enum(['draft', 'published', 'ended']),
    budgetCents: z.number().int().positive().max(100_000_000),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    terms: sprintTermsSchema,
  })
  .superRefine((value, ctx) => {
    if (Date.parse(value.endsAt) <= Date.parse(value.startsAt))
      ctx.addIssue({
        code: 'custom',
        message: 'End date must follow start date',
      })
  })
export type SprintTerms = z.infer<typeof sprintTermsSchema>
export type CreatorSprint = {
  id: string
  name: string
  description: string
  status: 'draft' | 'published' | 'ended'
  budgetCents: number
  startsAt: string
  endsAt: string
  terms: SprintTerms
  usedCents: number
  counts: {
    pending: number
    in_review: number
    approved: number
    rejected: number
    paid: number
  }
}
export type SprintProof = {
  id: string
  handle: string | null
  title: string
  platform: string
  postUrl: string | null
  views: number
  amountCents: number
  status: string
  createdAt: string
}
export function sprintPhase(
  sprint: Pick<CreatorSprint, 'status' | 'startsAt' | 'endsAt'>,
  now = Date.now(),
) {
  if (sprint.status === 'draft') return 'draft'
  if (sprint.status === 'ended' || Date.parse(sprint.endsAt) <= now)
    return 'past'
  return Date.parse(sprint.startsAt) > now ? 'scheduled' : 'active'
}
// Milestones are total payouts, not cumulative awards. Tier-1 shares scale against the advertised maximum.
export function sprintPayoutCents(
  terms: SprintTerms,
  views: number,
  audiencePercent: number | null,
) {
  if (
    !Number.isInteger(views) ||
    views < 0 ||
    audiencePercent === null ||
    !Number.isFinite(audiencePercent) ||
    audiencePercent < terms.minimumTier1Percent ||
    audiencePercent > 100
  )
    return 0
  const milestone = terms.milestones.findLast((item) => views >= item.views)
  if (milestone?.audienceRates) {
    return (
      milestone.audienceRates.findLast(
        (rate) => audiencePercent >= rate.audiencePercent,
      )?.amountCents || 0
    )
  }
  return milestone
    ? Math.round(
        milestone.amountCents *
          Math.min(audiencePercent / terms.maximumTier1Percent, 1),
      )
    : 0
}
export function sprintFormat(
  terms: SprintTerms,
  id: string,
): CreatorSubmissionFormat | undefined {
  return terms.formats.find((item) => item.id === id && item.active)
}
export function sprintReviewItems(terms: SprintTerms, id: string) {
  const format = sprintFormat(terms, id)
  if (!format) return []
  return [
    ...format.elements.map((item, i) => ({
      id: `element-${i + 1}`,
      label: item.title,
      detail: item.detail,
    })),
    ...format.requirements.map((label, i) => ({
      id: `requirement-${i + 1}`,
      label,
      detail: 'Sprint requirement',
    })),
    ...format.notAllowed.map((label, i) => ({
      id: `restriction-${i + 1}`,
      label: `Avoided: ${label}`,
      detail: 'Sprint restriction',
    })),
    ...terms.rules.map((label, i) => ({
      id: `sprint-rule-${i + 1}`,
      label,
      detail: 'Campaign rule',
    })),
  ]
}
export function referralCode(
  link: { slug: string; publicUrl: string } | null | undefined,
) {
  if (!link) return null
  // Public aliases resolve to the same attribution record; keep legacy codes valid.
  try {
    const alias = new URL(link.publicUrl).pathname.match(
      /^\/r\/(mogging-[a-z0-9._-]+)$/,
    )?.[1]
    if (alias) return alias
  } catch {}
  return link.slug
}
export const sprintMoney = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(cents / 100)
export const sprintViews = (views: number) =>
  new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(views)
