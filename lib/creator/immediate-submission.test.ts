import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { ANCHOR_REQUIREMENT, GENERATED_FACIAL_CAMPAIGN_ID, replacementFacialTerms } from './facial-campaign-update'
import { detailedAnalysisVariantTerms } from './detailed-analysis-variant'

const generatedTerms = replacementFacialTerms(detailedAnalysisVariantTerms(launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), 'bd0d7a74-3c39-44dd-98ec-21bf6667a714'))
let campaign: any
let saved: any
let evidenceChecks = 0
let requestedCents: number | undefined
let duplicate: any
const account = { id: '11111111-1111-4111-8111-111111111111', platform: 'tiktok', handle: 'examplecreator', creatorProfileId: 'creator' }
const tx = {
  execute: async () => [],
  query: { creatorSubmissions: { findFirst: async () => duplicate } },
  select: () => ({ from: () => ({ where: () => ({ for: async () => [campaign] }) }) }),
  insert: () => ({ values: (values: any) => ({ returning: async () => { saved = { id: 'submission', ...values }; return [saved] } }) }),
}
mock.module('@/lib/db', () => ({ schema, db: { query: {
  creatorProfiles: { findFirst: async () => ({ id: 'creator', authStatus: 'verified' }) },
  creatorSprints: { findFirst: async () => campaign },
  creatorSocialAccounts: { findFirst: async () => account, findMany: async () => [account] },
}, transaction: async (fn: any) => fn(tx) } }))
mock.module('./campaign-budget-service', () => ({ lockCampaignBudget: async () => ({}), requireSubmissionBudget: async (_tx: any, _id: string, cents: number) => { requestedCents = cents } }))
mock.module('./submission-updates', () => ({ recordSubmissionUpdate: async () => {}, getCreatorSubmissionUpdates: async () => [] }))
mock.module('@/lib/storage/videos', () => ({ creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`, verifyCreatorRecordingUpload: async () => { evidenceChecks++ } }))
const { createCreatorSubmission } = await import('./service')
const input = { sprintId: GENERATED_FACIAL_CAMPAIGN_ID, formatId: generatedTerms.formats[0].id, requirementsConfirmed: true as const, earlySubmission: true as const, socialAccountId: account.id, postUrl: 'https://www.tiktok.com/@examplecreator/video/1234567890' }
beforeEach(() => {
  campaign = { id: input.sprintId, status: 'published', terms: generatedTerms, startsAt: new Date('2020-01-01'), endsAt: new Date('2099-01-01'), updatedAt: new Date('2026-11-09') }
  saved = null; duplicate = null; evidenceChecks = 0; requestedCents = undefined
})
test('new facial videos can be tracked at zero views without invented analytics or reserved earnings', async () => {
  const result = await createCreatorSubmission('user', input)
  expect(result).toMatchObject({ viewCountThreshold: 0, usAudiencePercent: null, analyticsScreenshotUrl: null, analyticsStorageKey: null, isDraft: false })
  expect(result.sprintTerms?.rules).toContain(ANCHOR_REQUIREMENT)
  expect(evidenceChecks).toBe(0)
  expect(requestedCents).toBe(0)
})
test('other campaigns cannot use the early submission API to skip analytics', async () => {
  campaign.terms = launchCampaignTerms(LAUNCH_CAMPAIGNS[1])
  await expect(createCreatorSubmission('user', input)).rejects.toThrow('requires analytics at its first milestone')
  expect(saved).toBeNull()
})
test('duplicate and inactive campaigns are still rejected for immediate submissions', async () => {
  duplicate = { id: 'already-submitted' }
  await expect(createCreatorSubmission('user', input)).rejects.toThrow('already been submitted')
  duplicate = null; campaign.status = 'ended'
  await expect(createCreatorSubmission('user', input)).rejects.toThrow('Choose an active campaign')
  expect(saved).toBeNull()
})
