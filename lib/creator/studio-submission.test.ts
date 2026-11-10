import { afterAll, beforeAll, expect, mock, test } from 'bun:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from '@/lib/db/schema'
import { replacementFacialTerms } from './facial-campaign-update'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { sprintPayoutCents, sprintReviewItems } from './sprints'
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
const { studioCampaignMatches, claimStudioRequirementsReminder, registerStudioGeneration, submitStudioPost } = await import('./studio-submission')
const { requestSubmissionReview, createCreatorSubmission } = await import('./service')
const { reviewCreatorResource } = await import('@/lib/admin/creator-service')
const { listCreatorSprints } = await import('./sprint-service')
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

integration('shows requirements once per creator per seven days, including simultaneous opens', async () => {
  const results = await Promise.all([claimStudioRequirementsReminder(userId), claimStudioRequirementsReminder(userId)])
  expect(results.filter(result => result.show)).toHaveLength(1)
  expect((await claimStudioRequirementsReminder(userId)).show).toBe(false)
  await client`update creator_profiles set studio_requirements_seen_at=now()-interval '6 days 23 hours' where id=${creatorId}`
  expect((await claimStudioRequirementsReminder(userId)).show).toBe(false)
  await client`update creator_profiles set studio_requirements_seen_at=now()-interval '7 days' where id=${creatorId}`
  expect((await claimStudioRequirementsReminder(userId)).show).toBe(true)
})

integration('requirements reminders do not grant access to suspended or locked creators', async () => {
  await client`update creator_profiles set auth_status='suspended' where id=${creatorId}`
  await expect(claimStudioRequirementsReminder(userId)).rejects.toThrow('access')
  await client`update creator_profiles set auth_status='verified',video_studio_access=false where id=${creatorId}`
  await expect(claimStudioRequirementsReminder(userId)).rejects.toThrow('access')
  await client`update creator_profiles set video_studio_access=true where id=${creatorId}`
})

integration('retainer snapshots govern Studio and regular submissions, budget reservations and review after expiry', async () => {
  const now = Date.now(), agreement = {id:crypto.randomUUID(),amountCents:1000,minimumTier1Percent:22.5,
    startsAt:new Date(now-86400000).toISOString(),endsAt:new Date(now+10*86400000).toISOString()}
  await client`update creator_profiles set retainer_terms=${JSON.stringify(agreement)}::text::jsonb where id=${creatorId}`
  try {
    const campaigns = await listCreatorSprints(false,userId)
    expect(campaigns.find(campaign=>campaign.id===campaignId)?.terms.retainer?.id).toBe(agreement.id)
    const receipt = await registerStudioGeneration(userId,exported())
    expect(receipt.minimumViews).toBe(0)
    const submission = await submitStudioPost(userId,post(receipt.id))
    expect(submission.sprintTerms?.retainer?.id).toBe(agreement.id)
    const reviewed = await requestSubmissionReview(userId,submission.id,{...evidence(0),usAudiencePercent:22.5})
    expect(reviewed.status).toBe('in_review')
    const [pending] = await client`select creator_campaign_expected_payout(sprint_terms,view_count_threshold,us_audience_percent) cents from creator_submissions where id=${submission.id}`
    expect(pending.cents).toBe(1000)
    const regular = await createCreatorSubmission(userId,{...evidence(0),usAudiencePercent:22.5,sprintId:campaignId,formatId:terms.formats[0].id,requirementsConfirmed:true,socialAccountId:accountId,postUrl:post(receipt.id).postUrl})
    expect(regular.sprintTerms?.retainer?.id).toBe(agreement.id)
    expect(sprintPayoutCents(regular.sprintTerms!,0,22.5)).toBe(1000)
    await client`update creator_profiles set retainer_terms=${JSON.stringify({...agreement,endsAt:new Date(now-1000).toISOString()})}::text::jsonb where id=${creatorId}`
    expect((await registerStudioGeneration(userId,exported())).minimumViews).toBe(5000)
    await expect(createCreatorSubmission(userId,{...evidence(0),sprintId:campaignId,formatId:terms.formats[0].id,requirementsConfirmed:true,socialAccountId:accountId,postUrl:post(receipt.id).postUrl})).rejects.toThrow('at least')
    const approval = {resource:'submission' as const,id:submission.id,status:'approved' as const,adminViewCountThreshold:0,adminUsAudiencePercent:22.5,
      reviewChecklist:sprintReviewItems(reviewed.sprintTerms!,reviewed.formatId!).map(item=>({id:item.id,met:true,note:null}))}
    await expect(reviewCreatorResource({...approval,approvedAmountCents:5000,reviewNote:'Attempted override'})).rejects.toThrow('Retainer earnings are fixed')
    await expect(reviewCreatorResource({...approval,approvedAmountCents:1000,adminUsAudiencePercent:22.49})).rejects.toThrow('Retainer earnings are fixed')
    const approved = await reviewCreatorResource(approval)
    expect(approved).toMatchObject({approvedAmountCents:1000,status:'approved'})
    const [extras] = await client`select count(*)::int count from creator_payments where submission_id=${submission.id} and bonus_key is not null`
    expect(extras.count).toBe(0)
  } finally {await client`update creator_profiles set retainer_terms=null where id=${creatorId}`}
})

test('the replacement detailed campaign remains available to Video Studio without the retired version pairing', () => {
  const replacement = replacementFacialTerms(terms)
  expect(replacement.mgcSourceCampaignId).toBeUndefined()
  expect(studioCampaignMatches(replacement, 'portrait-audit')).toBe(true)
  expect(studioCampaignMatches(terms, 'portrait-audit')).toBe(true)
  expect(studioCampaignMatches({ ...terms, mgcSourceCampaignId: undefined }, 'portrait-audit')).toBe(false)
  expect(studioCampaignMatches(replacement, 'measurement-explainer')).toBe(false)
})
