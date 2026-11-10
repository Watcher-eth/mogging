import { expect, test } from 'bun:test'
import { detailedAnalysisVariantTerms } from './detailed-analysis-variant'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { ANCHOR_REQUIREMENT, GENERATED_FACIAL_CAMPAIGN_ID, replacementFacialTerms, withAnchorRequirement } from './facial-campaign-update'
import { minimumSubmissionViews, creatorSubmissionAnalyticsSchema, creatorSubmissionSchema } from './validation'
import { sprintPayoutCents, sprintReviewItems, sprintTermsSchema } from './sprints'

const original = sprintTermsSchema.parse(detailedAnalysisVariantTerms(launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'))

test('applies the requested Tier A flat rates and preserves the 35% reduction for other tiers', () => {
  const terms = replacementFacialTerms(original)
  expect(terms.milestones.map(item => item.amountCents)).toEqual([520, 2000, 4225, 10500, 20000])
  expect(terms.milestones.map(item => item.views)).toEqual(original.milestones.map(item => item.views))
  for (const [index, item] of terms.milestones.entries()) {
    expect(item.audienceRates!.filter(rate => rate.audiencePercent < 32)).toEqual(original.milestones[index].audienceRates!.filter(rate => rate.audiencePercent < 32).map(rate => ({ ...rate, amountCents: Math.round(rate.amountCents * .65) })))
    expect(item.audienceRates!.filter(rate => rate.audiencePercent >= 32).every(rate => rate.amountCents === item.amountCents)).toBe(true)
  }
  expect(terms.bonusBudgetCents).toBe(original.bonusBudgetCents)
  expect(original.submitOnPublish).toBeUndefined()
  expect(terms.mgcSourceCampaignId).toBeUndefined()
  expect(() => replacementFacialTerms(terms)).toThrow('already been applied')
})

test('initial zero-view submission earns nothing; milestones still require analytics and audience', () => {
  const terms = replacementFacialTerms(original)
  expect(sprintPayoutCents(terms, 0, null)).toBe(0)
  expect(sprintPayoutCents(terms, 4999, 40)).toBe(0)
  expect(minimumSubmissionViews(terms)).toBe(5000)
  expect(sprintPayoutCents(terms, 5000, 32)).toBe(520)
  const input = { sprintId: GENERATED_FACIAL_CAMPAIGN_ID, formatId: terms.formats[0].id, requirementsConfirmed: true, earlySubmission: true, postUrl: 'https://www.tiktok.com/@examplecreator/video/123' }
  expect(creatorSubmissionSchema.safeParse(input).success).toBe(true)
  expect(creatorSubmissionSchema.safeParse({ ...input, earlySubmission: false }).success).toBe(false)
  expect(creatorSubmissionAnalyticsSchema.safeParse(input).success).toBe(false)
})

test('review checklist uses the new studio process and includes the required anchor once', () => {
  const terms = replacementFacialTerms(original)
  const items = sprintReviewItems(terms, terms.formats[0].id)
  expect(items.find(item => item.id === 'element-1')?.label).toBe('Open the new Creator Studio')
  expect(items.some(item => item.label === ANCHOR_REQUIREMENT)).toBe(true)
  expect(withAnchorRequirement(terms).rules.filter(rule => rule === ANCHOR_REQUIREMENT)).toHaveLength(1)
  expect(original.rules).not.toContain(ANCHOR_REQUIREMENT)
})
