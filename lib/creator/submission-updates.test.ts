import { beforeEach, expect, mock, test } from 'bun:test'
mock.module('@/lib/db', () => ({ db: {}, schema: {} }))
const { recordReviewUpdate } = await import('./submission-updates')
let events: any[] = []
const tx: any = { insert: () => ({ values: async (event: unknown) => { events.push(event) } }) }
const previous = { id: 'own-post', status: 'in_review', reviewNote: null, reviewRequestedAt: null }
beforeEach(() => { events = [] })

test('approval and review note are captured together', async () => {
  await recordReviewUpdate(tx, previous, { status: 'approved', reviewNote: 'Nice work' })
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ submissionId: previous.id, type: 'approved', note: 'Nice work' })
})
test('saving an unchanged review does not repeat an update', async () => {
  await recordReviewUpdate(tx, { ...previous, status: 'approved', reviewNote: 'Nice work' }, { status: 'approved', reviewNote: 'Nice work' })
  expect(events).toHaveLength(0)
})
test('a fresh review decision is retained even when the previous status matches', async () => {
  await recordReviewUpdate(tx, { ...previous, status: 'approved', reviewRequestedAt: new Date() }, { status: 'approved' })
  expect(events[0].type).toBe('approved')
})
test('new feedback on an existing decision is its own update', async () => {
  await recordReviewUpdate(tx, { ...previous, status: 'rejected' }, { status: 'rejected', reviewNote: 'Please show the analytics page' })
  expect(events[0]).toMatchObject({ type: 'feedback', note: 'Please show the analytics page' })
})
test('marking a post paid does not pretend a transfer has completed', async () => {
  await recordReviewUpdate(tx, previous, { status: 'paid' })
  expect(events).toHaveLength(0)
})

test('a higher approved view milestone records a new decision, but repeat saves and decreases do not', async () => {
  const approved = { ...previous, status: 'approved', adminViewCountThreshold: 100000 }
  await recordReviewUpdate(tx, approved, { status: 'approved', adminViewCountThreshold: 300000 })
  expect(events).toHaveLength(1)
  expect(events[0].type).toBe('approved')
  events = []
  await recordReviewUpdate(tx, approved, { status: 'approved', adminViewCountThreshold: 100000 })
  await recordReviewUpdate(tx, approved, { status: 'approved', adminViewCountThreshold: 50000 })
  expect(events).toHaveLength(0)
})

test('approval amount and audience changes create history without repeating unchanged saves', async () => {
 const approved = { ...previous, status: 'approved', approvedAmountCents: 1500, adminUsAudiencePercent: 40 }
 await recordReviewUpdate(tx, approved, {status:'approved',approvedAmountCents:2250,adminUsAudiencePercent:40})
 await recordReviewUpdate(tx, approved, {status:'approved',approvedAmountCents:1500,adminUsAudiencePercent:45})
 expect(events).toHaveLength(2)
 await recordReviewUpdate(tx, approved, {status:'approved',approvedAmountCents:1500,adminUsAudiencePercent:40})
 expect(events).toHaveLength(2)
})
