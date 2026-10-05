import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
let submission: any
let payments: any[] = []
let verified = 0
let writes = 0
let uploadExists = true
let messages: any[] = []
const tx = {
  query: { creatorPayments: { findMany: async () => payments } },
  select: () => ({ from: () => ({ where: () => ({ for: async () => [submission] }) }) }),
  insert: () => ({ values: async (value: any) => { messages.push(value) } }),
  update: () => ({ set: (value: any) => ({ where: () => ({ returning: async () => { writes++; submission = {...submission, ...value}; return [submission] } }) }) }),
}
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
  submission = {id:'submission', creatorProfileId:'creator', sprintId:'campaign', sprintTerms:{}, status:'paid', approvedAmountCents:1000, analyticsStorageKey:'old-key', analyticsScreenshotUrl:'https://media.example/old.mp4', viewCountThreshold:20000}
  payments = [{status:'paid',amountCents:1000}]; verified=0; writes=0; uploadExists=true; messages=[]
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
