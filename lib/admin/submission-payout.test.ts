import { expect, test } from 'bun:test'
import { getSubmissionPayoutEstimate } from './submission-payout'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { detailedAnalysisVariantTerms } from '@/lib/creator/detailed-analysis-variant'

const original = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'detailed-analysis')!)
const mgc = detailedAnalysisVariantTerms(original, 'bd0d7a74-3c39-44dd-98ec-21bf6667a714')
test('admin review estimates distinguish the original and MGC even with identical format IDs', () => {
  expect(original.formats[0].id).toBe(mgc.formats[0].id)
  for (const [views, regularAmount, mgcAmount] of [[50000,40,30],[100000,70,65],[300000,120,65],[500000,180,180]]) {
    expect(getSubmissionPayoutEstimate({ viewCountThreshold: views, usAudiencePercent: 32 }, { sprintTerms: original })?.payout).toBe(regularAmount)
    expect(getSubmissionPayoutEstimate({ viewCountThreshold: views, usAudiencePercent: 32 }, { sprintTerms: mgc })?.payout).toBe(mgcAmount)
  }
})
test('admin review uses the saved submission snapshot after campaign rates change', () => {
  const saved = structuredClone(mgc)
  const current = structuredClone(mgc)
  current.milestones.find(item => item.views === 100000)!.amountCents = 9000
  expect(getSubmissionPayoutEstimate({ viewCountThreshold: 100000, usAudiencePercent: 32 }, { sprintTerms: saved })?.payout).toBe(65)
  expect(saved).toEqual(mgc)
})
test('MGC verified audience tiers apply before admin approval', () => {
  expect(getSubmissionPayoutEstimate({ viewCountThreshold: 100000, usAudiencePercent: 22.5 }, { sprintTerms: mgc })?.payout).toBe(42.25)
  expect(getSubmissionPayoutEstimate({ viewCountThreshold: 100000, usAudiencePercent: 14.9 }, { sprintTerms: mgc })?.payout).toBe(0)
})
