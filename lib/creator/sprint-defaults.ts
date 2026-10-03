import { ACTIVE_CREATOR_SUBMISSION_FORMATS } from './formats'
import { calculateCreatorPayout, CREATOR_VIEW_THRESHOLDS } from './payouts'
import type { SprintTerms } from './sprints'

export const CREATOR_AUDIENCE_BANDS = [
  { tier: 'D', minimumPercent: 0, payoutPercent: 20 },
  { tier: 'C', minimumPercent: 15, payoutPercent: 40 },
  { tier: 'B', minimumPercent: 22.5, payoutPercent: 65 },
  { tier: 'A', minimumPercent: 30, payoutPercent: 100 },
] as const

export function campaignAudienceRates(amountCents: number) {
  return [
    ...CREATOR_AUDIENCE_BANDS.map((band) => ({
      audiencePercent: band.minimumPercent,
      amountCents: Math.round((amountCents * band.payoutPercent) / 100),
    })),
    { audiencePercent: 40, amountCents },
  ]
}

export function campaignRegionRates(terms: SprintTerms) {
  const grouped =
    terms.minimumTier1Percent === 0 &&
    terms.maximumTier1Percent === 40 &&
    terms.milestones.every((milestone) => {
      const rates = milestone.audienceRates
      if (!rates) return false
      const expected = campaignAudienceRates(milestone.amountCents)
      return (
        rates.length === expected.length &&
        expected.every(
          (rate, index) =>
            rate.audiencePercent === rates[index].audiencePercent &&
            rate.amountCents === rates[index].amountCents,
        )
      )
    })
  return grouped
    ? 'Region rates: Tier A pays 100% · Tier B 65% · Tier C 40% · Tier D 20%.'
    : `Region rates: Tier 1 audience ${terms.minimumTier1Percent}–${terms.maximumTier1Percent}%; payouts follow the campaign’s audience rates.`
}

export function defaultCreatorSprintTerms(): SprintTerms {
  return {
    milestones: CREATOR_VIEW_THRESHOLDS.map(({ views }) => {
      const amountCents = calculateCreatorPayout(views, true, 40).payout * 100
      return {
        views,
        amountCents,
        audienceRates: campaignAudienceRates(amountCents),
      }
    }),
    minimumTier1Percent: 0,
    maximumTier1Percent: 40,
    submissionWindowHours: 3 * 24,
    platforms: ['tiktok', 'instagram'],
    rules: ['Include your Mogging referral code in your bio and caption.'],
    formats: ACTIVE_CREATOR_SUBMISSION_FORMATS.map((format) => ({
      ...format,
      elements: format.elements.map((element) => ({ ...element })),
      requirements: format.requirements.map((rule) =>
        rule === 'Submit within 30 days of publishing'
          ? 'Submit within 3 days of publishing'
          : rule,
      ),
      notAllowed: [...format.notAllowed],
    })),
  }
}
