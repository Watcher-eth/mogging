import { describe, expect, test } from 'bun:test'
import { canSeeCampaign, campaignAudienceSchema } from './campaign-access'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms, launchCampaign } from './campaign-launch'
import { detailedAnalysisVariantTerms } from './detailed-analysis-variant'
import { sprintPayoutCents } from './sprints'

const id = 'a4ebf114-15a8-42b2-ac61-134690ef1db0'
describe('campaign audience', () => {
  test('defaults preserve access for existing campaigns', () => {
    expect(canSeeCampaign(undefined)).toBe(true)
    expect(canSeeCampaign({ mode: 'all', creatorIds: [] }, id)).toBe(true)
  })
  test('selected and excluded lists give complementary access and fail closed for private campaigns', () => {
    const selected = { mode: 'selected' as const, creatorIds: [id] }
    const except = { ...selected, mode: 'except' as const }
    for (const creator of [id, 'other', undefined, null]) {
      expect(canSeeCampaign(selected, creator)).toBe(creator === id)
      expect(canSeeCampaign(except, creator)).toBe(creator !== id)
    }
    expect(canSeeCampaign({ mode: 'selected', creatorIds: [] }, id)).toBe(false)
  })
  test('rejects malformed and duplicate creator IDs', () => {
    expect(campaignAudienceSchema.safeParse({ mode: 'selected', creatorIds: ['wrong'] }).success).toBe(false)
    expect(campaignAudienceSchema.safeParse({ mode: 'selected', creatorIds: [id, id] }).success).toBe(false)
  })
})
test('detailed analysis variant preserves the source and all other terms, including bonus eligibility', () => {
  const original = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'detailed-analysis')!)
  const snapshot = structuredClone(original)
  const variant = detailedAnalysisVariantTerms(original, 'bd0d7a74-3c39-44dd-98ec-21bf6667a714')
  expect(original).toEqual(snapshot)
  expect(variant.milestones.map(item => [item.views, item.amountCents])).toEqual([[5000,800],[50000,3000],[100000,6500],[500000,18000],[1000000,32500]])
  const { mgcSourceCampaignId, ...otherTerms } = variant
  expect(mgcSourceCampaignId).toBe('bd0d7a74-3c39-44dd-98ec-21bf6667a714')
  expect({ ...otherTerms, milestones: original.milestones }).toEqual(original)
  expect(launchCampaign(variant)?.key).toBe('detailed-analysis')
  expect(sprintPayoutCents(variant, 50000, 32)).toBe(3000)
  expect(sprintPayoutCents(variant, 100000, 32)).toBe(6500)
  expect(sprintPayoutCents(variant, 300000, 32)).toBe(6500)
  expect(sprintPayoutCents(variant, 100000, 22.5)).toBe(4225)
  expect(sprintPayoutCents(original, 100000, 32)).toBe(7000)
})
