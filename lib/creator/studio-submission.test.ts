import { afterAll, beforeAll, expect, mock, test } from 'bun:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/lib/db/schema'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { sprintPayoutCents } from './sprints'
import { compileAnalysisVideo } from './video-composition'
import { buildAnalysisPost, type AnalysisPostInput } from './analysis-post'
import { reportCategories } from './mock-report-data'
import { getApprovalQueue } from '@/lib/admin/creator-overview'
import type { AdminDashboard } from '@/components/admin/creator-types'

// Explicit opt-in, disposable localhost database only. Run after loading the schema.
const url = process.env.STUDIO_TEST_DATABASE_URL
if (url && !/^postgres(?:ql)?:\/\/[^/]*@(?:127\.0\.0\.1|localhost):\d+\//.test(url)) throw new Error('Studio tests require a disposable localhost database')
const integration = url ? test : test.skip
const client = postgres(url ?? 'postgres://test@127.0.0.1:1/unused', { max: 3, prepare: false })
mock.module('@/lib/db', () => ({ db: drizzle(client, { schema }), schema }))
mock.module('@/lib/env', () => ({ env: { CREATOR_ACCOUNT_REQUIRED_FOR_SUBMISSION: true } }))
mock.module('@/lib/storage/videos', () => ({ creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`, verifyCreatorRecordingUpload: async () => {} }))
const { registerStudioGeneration, submitStudioPost } = await import('./studio-submission')
const { requestSubmissionReview } = await import('./service')
const creatorId = crypto.randomUUID(), userId = crypto.randomUUID(), accountId = crypto.randomUUID(), campaignId = crypto.randomUUID(), sourceId = crypto.randomUUID(), comparisonId = crypto.randomUUID()
const terms = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'detailed-analysis')!)
terms.mgcSourceCampaignId = sourceId
terms.milestones = terms.milestones.filter(item => item.views !== 300000).map(item => ({ ...item, amountCents: item.views === 50000 ? 3000 : item.views === 100000 ? 6500 : item.amountCents, audienceRates: item.audienceRates?.map(rate => ({ ...rate, amountCents: Math.round(rate.amountCents * (item.views === 50000 ? .75 : item.views === 100000 ? 65 / 70 : 1)) })) }))
const input: AnalysisPostInput = { formatId: 'score-reveal', subject: 'Fixture', hook: 'Look closer.', overallScore: '7', potentialScore: '8', strongestFeature: 'Eyes', strongestScore: '8', opportunityFeature: 'Jaw', opportunityScore: '6', recommendation: 'Compare the same portrait.', productFeatures: ['Category scores'], cta: 'Get your face analysis.' }
const composition = compileAnalysisVideo(buildAnalysisPost(input), input, ['fixture-face'], 'brand', reportCategories, { recipe: 'portrait-audit' })
const exported = () => ({ id: crypto.randomUUID(), personId: 'tom-holland', storyId: 'fixture-story', contentHash: 'a'.repeat(64), composition })
const post = (generationId: string) => ({ generationId, socialAccountId: accountId, postUrl: `https://www.tiktok.com/@studiofixture/video/${Date.now()}${Math.floor(Math.random()*10000)}`, requirementsConfirmed: true })
const evidence = (views: number) => ({ analyticsVideoUrl: 'https://media.example/evidence.mp4', analyticsPhysicalRecordingConfirmed: true, analyticsStorageKey: `creators/${userId}/submission-analytics/${crypto.randomUUID()}.mp4`, analyticsContentType: 'video/mp4', analyticsSizeBytes: 100, viewCountThreshold: views, usAudiencePercent: 32 } as const)
beforeAll(async () => {
  if (!url) return
  await client`insert into users (id,email) values (${userId},${`${userId}@example.test`})`
  await client`insert into creator_profiles (id,user_id,display_name,video_studio_access,auth_status) values (${creatorId},${userId},'Studio fixture',true,'verified')`
  await client`insert into creator_social_accounts (id,creator_profile_id,platform,handle) values (${accountId},${creatorId},'tiktok','studiofixture')`
  for (const [id,name,savedTerms] of [[sourceId,'Regular analysis', { ...terms, mgcSourceCampaignId: undefined }], [campaignId,'Mogging Detailed Analysis MGC',terms], [comparisonId,'Face Feature Comparison',launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'feature-comparison')!)]] as const) {
    await client`insert into creator_sprints (id,name,description,status,starts_at,ends_at,budget_cents,terms,audience) values (${id},${name},'Fixture','published',now()-interval '1 day',now()+interval '1 day',1000000,${JSON.stringify(savedTerms as any)},${JSON.stringify({mode:'selected',creatorIds:[creatorId]})})`
  }
})
afterAll(async () => {
  if (url) { await client`delete from users where id=${userId}`; await client`delete from creator_sprints where id in (${campaignId},${comparisonId},${sourceId})` }
  await client.end()
})
integration('uses the MGC campaign snapshot, never regular rates, and keeps attribution immutable', async () => {
  const payload = exported(), receipt = await registerStudioGeneration(userId, payload)
  const [saved] = await client`select * from creator_studio_generations where id=${receipt.id}`
  expect(saved.sprint_id).toBe(campaignId)
  expect(sprintPayoutCents(saved.sprint_terms,50000,32)).toBe(3000)
  expect(saved.composition.scenes).toEqual(composition.scenes)
  expect((await registerStudioGeneration(userId,payload)).id).toBe(receipt.id)
  await expect(registerStudioGeneration(userId,{...payload,contentHash:'b'.repeat(64)})).rejects.toThrow('identity')
  await expect(Promise.resolve(client`update creator_studio_generations set person_id='changed' where id=${receipt.id}`)).rejects.toThrow('immutable')
})
integration('enforces creator and campaign access, including export ownership', async () => {
  const receipt = await registerStudioGeneration(userId,exported())
  await client`update creator_profiles set video_studio_access=false where id=${creatorId}`
  await expect(submitStudioPost(userId,post(receipt.id))).rejects.toThrow('access')
  await client`update creator_profiles set video_studio_access=true where id=${creatorId}`
  await client`update creator_sprints set audience=${JSON.stringify({mode:'selected',creatorIds:[]})} where id=${campaignId}`
  await expect(registerStudioGeneration(userId,exported())).rejects.toThrow('assigned campaign')
  await client`update creator_sprints set audience=${JSON.stringify({mode:'selected',creatorIds:[creatorId]})} where id=${campaignId}`
  await expect(submitStudioPost(userId,post(crypto.randomUUID()))).rejects.toThrow('not found')
})
integration('registers a post without analytics, deduplicates it, then requests a first review at its milestone', async () => {
  const generation = await registerStudioGeneration(userId,exported()), payload = post(generation.id)
  const submission = await submitStudioPost(userId,payload)
  expect(submission.studioGenerationId).toBe(generation.id)
  expect(submission.analyticsScreenshotUrl).toBeNull()
  expect(submission.approvedAmountCents).toBeNull()
  expect(submission.viewCountThreshold).toBeNull()
  expect((await submitStudioPost(userId,payload)).id).toBe(submission.id)
  const other = await registerStudioGeneration(userId,exported())
  await expect(submitStudioPost(userId,{...payload,generationId:other.id})).rejects.toThrow('already')
  const dashboard = (posts: unknown[]) => ({ submissions: posts, accounts: [], creators: [] } as unknown as AdminDashboard)
  expect(getApprovalQueue(dashboard([submission]))).toHaveLength(0)
  await expect(requestSubmissionReview(userId,submission.id,evidence(4999))).rejects.toThrow()
  const reviewed = await requestSubmissionReview(userId,submission.id,evidence(5000))
  expect(reviewed.status).toBe('in_review')
  expect(getApprovalQueue(dashboard([reviewed]))).toHaveLength(1)
  const updates = await client`select type from creator_submission_updates where submission_id=${submission.id} order by created_at`
  expect(updates.map(item => item.type)).toEqual(['submitted','in_review'])
  await expect(requestSubmissionReview(userId,submission.id,evidence(5000))).rejects.toThrow('awaiting review')
  await client`update creator_submissions set status='approved',review_requested_at=null where id=${submission.id}`
  await requestSubmissionReview(userId,submission.id,evidence(50000))
  const [latest] = await client`select type from creator_submission_updates where submission_id=${submission.id} order by created_at desc limit 1`
  expect(latest.type).toBe('rereview_requested')
})
integration('feature breakdown selects Face Feature Comparison', async () => {
  const receipt = await registerStudioGeneration(userId,{...exported(),composition:{...composition,recipe:'measurement-explainer'}})
  const [saved] = await client`select sprint_id from creator_studio_generations where id=${receipt.id}`
  expect(saved.sprint_id).toBe(comparisonId)
})
