import { defaultCreatorSprintTerms } from './sprint-defaults'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from './campaign-launch'
import { GENERATED_FACIAL_CAMPAIGN_ID, replacementFacialTerms } from './facial-campaign-update'
import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
let submission: any
let payments: any[] = []
let verified = 0
let writes = 0
let uploadExists = true
let messages: any[] = []
let assignment: any
let assignmentCalls = 0
const tx = {
  execute: async () => [{ id: 'owner', budget_cents: 100000, terms: {}, committed: submission.approvedAmountCents ?? 0, pending: 0 }],
  query: { creatorPayments: { findMany: async () => payments } },
  select: () => ({ from: () => ({ where: () => ({ for: async () => [submission] }) }) }),
  insert: () => ({ values: async (value: any) => { messages.push(value) } }),
  update: () => ({ set: (value: any) => ({ where: () => ({ returning: async () => { writes++; submission = {...submission, ...value}; return [submission] } }) }) }),
}
mock.module('./rereview-campaign', () => ({ expiredRereviewAssignment: async () => { assignmentCalls++; return assignment } }))
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorProfiles: { findFirst: async () => ({id:'creator', authStatus:'verified'}) }, creatorSubmissions: { findFirst: async () => submission } },
  transaction: async (fn: any) => fn(tx),
} }))
mock.module('@/lib/storage/videos', () => ({ creatorAssetPublicUrl: (key: string) => `https://media.example/${key}`, verifyCreatorRecordingUpload: async () => { verified++; if (!uploadExists) throw Error('missing') } }))
const { requestSubmissionReview } = await import('./service')
const input = { analyticsVideoUrl:'https://untrusted.example/fake.mp4', analyticsPhysicalRecordingConfirmed:true as const,
  analyticsStorageKey:'creators/user/submission-analytics/00000000-0000-4000-8000-000000000001.mp4', analyticsContentType:'video/mp4' as const,
  analyticsSizeBytes:100, viewCountThreshold:40000, usAudiencePercent:40 }
beforeEach(() => {
  submission = {id:'submission', creatorProfileId:'creator', sprintId:'campaign', sprintTerms:defaultCreatorSprintTerms(), status:'paid', approvedAmountCents:1000, analyticsStorageKey:'old-key', analyticsScreenshotUrl:'https://media.example/old.mp4', viewCountThreshold:20000}
  payments = [{status:'paid',amountCents:1000}]; verified=0; writes=0; uploadExists=true; messages=[]; assignment=undefined; assignmentCalls=0
})
test('fresh analytics reopen the same submission and preserve prior approved earnings', async () => {
  const updated = await requestSubmissionReview('user','submission',input)
  expect(updated).toMatchObject({id:'submission', status:'in_review', approvedAmountCents:1000, viewCountThreshold:40000, usAudiencePercent:40})
  expect(updated.reviewRequestedAt).toBeInstanceOf(Date)
  expect(updated.analyticsScreenshotUrl).toBe(`https://media.example/${input.analyticsStorageKey}`)
  expect(messages[0].body).toContain('Previous evidence: https://media.example/old.mp4 (20000 views)')
  expect(verified).toBe(1)
})
test('a pending submission with cleared evidence can update views directly', async () => {
  submission = {...submission,status:'pending',analyticsScreenshotUrl:null,analyticsStorageKey:null,approvedAmountCents:null}; payments=[]
  expect(await requestSubmissionReview('user','submission',input)).toHaveProperty('viewCountThreshold',40000)
})
test('an immediately submitted facial video can add its first milestone evidence, but cannot claim below the threshold', async () => {
  submission = { ...submission, status: 'pending', sprintTerms: replacementFacialTerms(launchCampaignTerms(LAUNCH_CAMPAIGNS[0])), analyticsScreenshotUrl: null, analyticsStorageKey: null, viewCountThreshold: 0, approvedAmountCents: null, usAudiencePercent: null }
  payments = []
  await expect(requestSubmissionReview('user', 'submission', { ...input, viewCountThreshold: 4999 })).rejects.toThrow('5,000')
  expect(writes).toBe(0)
  const updated = await requestSubmissionReview('user', 'submission', { ...input, viewCountThreshold: 5000, usAudiencePercent: 32 })
  expect(updated).toMatchObject({ status: 'in_review', viewCountThreshold: 5000, usAudiencePercent: 32 })
  expect(updated.analyticsScreenshotUrl).toBe(`https://media.example/${input.analyticsStorageKey}`)
})
test('held facial analytics can be replaced at 20K and then block duplicate review requests', async () => {
  submission = {
    ...submission, sprintId: GENERATED_FACIAL_CAMPAIGN_ID,
    sprintTerms: replacementFacialTerms(launchCampaignTerms(LAUNCH_CAMPAIGNS[0])),
    status: 'in_review', reviewRequestedAt: new Date(), viewCountThreshold: 5_000, approvedAmountCents: null,
  }
  payments = []
  await expect(requestSubmissionReview('user', 'submission', { ...input, viewCountThreshold: 20_000 }))
    .resolves.toMatchObject({ status: 'in_review', viewCountThreshold: 20_000 })
  await expect(requestSubmissionReview('user', 'submission', input)).rejects.toThrow('already awaiting review')
  expect(writes).toBe(1)
})
test('another creator cannot reopen the submission', async () => {
  submission.creatorProfileId='other'
  // The ownership predicate is applied again in the locked query; mimic no matching row.
  const original = tx.select
  tx.select = () => ({from: () => ({where: () => ({for: async () => []})})}) as any
  await expect(requestSubmissionReview('user','submission',input)).rejects.toThrow()
  tx.select=original
  expect(writes).toBe(0)
})
test('duplicate requests and reuse of old evidence are rejected', async () => {
  submission.reviewRequestedAt=new Date()
  await expect(requestSubmissionReview('user','submission',input)).rejects.toThrow('already awaiting review')
  submission.reviewRequestedAt=null; submission.analyticsStorageKey=input.analyticsStorageKey
  await expect(requestSubmissionReview('user','submission',input)).rejects.toThrow('fresh analytics recording')
  expect(writes).toBe(0)
})
test('scheduled payouts must finish before rereview', async () => {
  for (const status of ['pending','processing']) {
    payments=[{status,amountCents:1000}]
    await expect(requestSubmissionReview('user','submission',input)).rejects.toThrow('scheduled payment')
  }
  expect(writes).toBe(0)
  expect(assignmentCalls).toBe(0)
})
test('incomplete, foreign, or reused account uploads cannot update analytics', async () => {
  uploadExists=false
  await expect(requestSubmissionReview('user','submission',input)).rejects.toThrow('complete physical analytics recording')
  uploadExists=true
  await expect(requestSubmissionReview('user','submission',{...input,analyticsStorageKey:input.analyticsStorageKey.replace('/user/','/other/')})).rejects.toThrow('Invalid analytics recording')
  expect(writes).toBe(0)
})
test('minimum views and physical recording confirmation remain required', async () => {
  await expect(requestSubmissionReview('user','submission',{...input,viewCountThreshold:19999})).rejects.toThrow('20,000')
  await expect(requestSubmissionReview('user','submission',{...input,analyticsPhysicalRecordingConfirmed:false} as any)).rejects.toThrow()
  expect(verified).toBe(0)
  expect(writes).toBe(0)
})

test('a fresh expired-campaign rereview applies the new assignment without repricing prior earnings', async () => {
  assignment = { sprintId: 'general', sprintTerms: defaultCreatorSprintTerms(), formatId: 'general-format', reviewChecklist: null }
  const updated = await requestSubmissionReview('user', 'submission', input)
  expect(updated).toMatchObject({ sprintId: 'general', formatId: 'general-format', approvedAmountCents: 1000, status: 'in_review' })
  expect(assignmentCalls).toBe(1)
  expect(payments).toEqual([{status:'paid',amountCents:1000}])
})

const analyticsRequest = { id: '00000000-0000-4000-8000-000000000007', description: 'Show the full audience locations.' }

test('the requested video replaces the evidence and returns an active review to the queue', async () => {
  submission = { ...submission, status: 'in_review', reviewRequestedAt: new Date(), analyticsVideoRequest: analyticsRequest }
  const saved = await requestSubmissionReview('user', 'submission', {
    ...input, viewCountThreshold: 15000, analyticsVideoRequestId: analyticsRequest.id,
  })
  expect(saved).toMatchObject({ id: 'submission', status: 'in_review', sprintId: 'campaign', analyticsVideoRequest: null,
    analyticsStorageKey: input.analyticsStorageKey, approvedAmountCents: 1000, viewCountThreshold: 15000,
    audienceCheck: { status: 'queued', storageKey: input.analyticsStorageKey },
  })
  expect(assignmentCalls).toBe(0)
  expect(messages[0].body).toContain('Submitted the requested analytics video')
  expect(messages[0].body).toContain('Previous evidence: https://media.example/old.mp4')
  await expect(requestSubmissionReview('user', 'submission', { ...input, analyticsVideoRequestId: analyticsRequest.id })).rejects.toThrow('request changed')
  expect(writes).toBe(1)
})

test('an unrelated rereview or failed upload does not close the request', async () => {
  submission.analyticsVideoRequest = analyticsRequest
  await expect(requestSubmissionReview('user', 'submission', input)).rejects.toThrow('request changed')
  uploadExists = false
  await expect(requestSubmissionReview('user', 'submission', { ...input, analyticsVideoRequestId: analyticsRequest.id })).rejects.toThrow('complete physical analytics recording')
  expect(submission.analyticsVideoRequest).toEqual(analyticsRequest)
  expect(writes).toBe(0)
})
