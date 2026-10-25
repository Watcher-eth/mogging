import { expect,test } from 'bun:test'
import { submissionHistory } from './submission-history'
const first='2026-10-20T12:00:00Z',approved='2026-10-21T12:00:00Z',rereview='2026-10-23T12:00:00Z'
const post={ id: 'post',createdAt: first,viewCountThreshold: 100000,usAudiencePercent: 60,reviewRequestedAt: rereview }
const snapshot={ submittedViews: 20000,submittedAudiencePercent: 40,verifiedViews: 20000,verifiedAudiencePercent: 38,approvedAmountCents: 1500,campaignId: 'old',campaignName: 'Old campaign' }
test('timeline preserves first metrics, rereview metrics, approval amounts and separate partial payouts in chronological order',() => {
  const entries=submissionHistory(post,[
    { id: 'approval2',type: 'approved',createdAt: '2026-10-24T12:00:00Z',note: null,historySnapshot: { ...snapshot,verifiedViews: 100000,verifiedAudiencePercent: 60,approvedAmountCents: 3000,campaignName: 'General' } },
    { id: 'first',type: 'submitted',createdAt: first,note: null,historySnapshot: snapshot },
    { id: 'approval1',type: 'approved',createdAt: approved,note: 'Approved',historySnapshot: snapshot },
    { id: 'again',type: 'rereview_requested',createdAt: rereview,note: null,historySnapshot: { ...snapshot,submittedViews: 100000,submittedAudiencePercent: 60 } },
  ],[],[{ id: 'paid1',amountCents: 1500,currency: 'USD',status: 'paid',paidAt: '2026-10-22T12:00:00Z',createdAt: approved,providerReference: 'receipt1' },{ id: 'paid2',amountCents: 1500,currency: 'USD',status: 'paid',paidAt: '2026-10-24T13:00:00Z',createdAt: '2026-10-24T12:00:00Z',providerReference: 'receipt2' }])
  expect(entries.map(e => e.title)).toEqual(['First submitted','Approved','Paid','Rereview requested','Approved','Paid'])
  expect(entries[0]).toMatchObject({ views: 20000,audiencePercent: 40 })
  expect(entries[1]).toMatchObject({ views: 20000,audiencePercent: 38,amountCents: 1500,campaign: 'Old campaign' })
  expect(entries[3]).toMatchObject({ views: 100000,audiencePercent: 60 })
  expect(entries[4]).toMatchObject({ amountCents: 3000,campaign: 'General' })
  expect(entries.filter(e => e.title==='Paid').reduce((sum,e) => sum+e.amountCents!,0)).toBe(3000)
})
test('legacy analytics messages recover previous views and rereview metrics without fabricating old approval amounts or audience',() => {
  const entries=submissionHistory(post,[{ id: 'approval',type: 'approved',createdAt: approved,note: null },{ id: 'again',type: 'rereview_requested',createdAt: rereview,note: null }],[{ id: 'message',createdAt: rereview,body: 'Submitted fresh analytics for review: 100,000 views · 60% Tier 1 audience. Previous evidence: https://media.test/old.mp4 (20000 views).' }],[])
  expect(entries).toHaveLength(3)
  expect(entries[0]).toMatchObject({ views: 20000,audiencePercent: null })
  expect(entries[1].amountCents).toBeUndefined()
  expect(entries[1].views).toBeNull()
  expect(entries[2]).toMatchObject({ views: 100000,audiencePercent: 60 })
})
test('a rereview message without an event still appears once, including the pending request',() => {
  const entries=submissionHistory(post,[],[{ id: 'message',createdAt: rereview,body: 'Submitted fresh analytics for review: 100,000 views · 60% Tier 1 audience.' }],[])
  expect(entries.filter(e => e.title==='Rereview requested')).toHaveLength(1)
  expect(entries[0].views).toBeNull()
})
test('bonus and failed payment statuses stay explicit; paidAt is used instead of row creation',() => {
  const entries=submissionHistory({ ...post,reviewRequestedAt: null },[],[],[{ id: 'bonus',amountCents: 1000,currency: 'USD',status: 'cancelled',createdAt: approved,paidAt: null,providerReference: null,bonusKey: 'audience:post:1000' },{ id: 'failed',amountCents: 1000,currency: 'USD',status: 'failed',createdAt: rereview,paidAt: null,providerReference: null }])
  expect(entries.map(e => e.title)).toEqual(['First submitted','Bonus cancelled','Payment failed'])
})
