import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
import { getCreatorSubmissionReviewItems } from '@/lib/creator/submission-review'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'
import { sprintReviewItems } from '@/lib/creator/sprints'

let submission: Record<string, any>
let writes = 0
const priorPayments = [{ status: 'paid', amountCents: 1300 }]
const tx = {
  query: { creatorPayments: { findMany: async () => priorPayments, findFirst: async () => undefined }, creatorProfiles: { findFirst: async () => ({ id: 'creator', paymentOption: 'paypal', bundledPayouts: false }) } },
  select: (fields?: unknown) => ({ from: (table: unknown) => ({ where: () => fields
    ? Promise.resolve([{ cents: submission.approvedAmountCents || 0 }])
    : { for: async () => table === schema.creatorSprints ? [{ id: 'campaign', budgetCents: 100000 }] : [submission] } }) }),
  update: () => ({ set: (values: unknown) => ({ where: () => ({ returning: async () => { writes++; submission = { ...submission, ...values as object }; return [submission] } }) }) }),
  insert: () => ({ values: (values: object) => ({ returning: async () => [{ id: 'payment', ...values }] }) }),
}
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorSubmissions: { findFirst: async () => submission } },
  transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
} }))
const { creatorAdminReviewSchema, reviewCreatorResource, createCreatorPayment } = await import('./creator-service')
const results = () => getCreatorSubmissionReviewItems('custom-video-v1').map(({ id }, i) => ({ id, met: i !== 0, note: i === 0 ? 'Show the CTA within 2–3 seconds.' : null }))
const input = () => {
  const parsed = creatorAdminReviewSchema.parse({ resource: 'submission', id: 'submission', status: 'rejected', adminViewCountThreshold: 40000, adminUsAudiencePercent: 30, reviewChecklist: results() })
  if (parsed.resource !== 'submission') throw new Error('Expected submission input')
  return parsed
}
beforeEach(() => { submission = { id: 'submission', formatId: 'custom-video-v1', status: 'pending', reviewNote: null }; writes = 0 })

test('rejection persists only selected failures and their creator-visible feedback', async () => {
  const saved = await reviewCreatorResource(input())
  expect(saved).toMatchObject({ status: 'rejected' })
  expect(saved).toHaveProperty('reviewChecklist', results())
  expect(writes).toBe(1)
})

test('an empty rejection cannot write a review', async () => {
  await expect(reviewCreatorResource({ ...input(), reviewChecklist: results().map(item => ({ ...item, met: true })) })).rejects.toThrow('Select at least one rejection reason')
  expect(writes).toBe(0)
})

test('rejecting a campaign rereview preserves prior approved earnings and paid records', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, approvedAmountCents: 2600, reviewRequestedAt: new Date() }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }, i) => ({ id, met: i !== 0, note: i === 0 ? 'CTA missing.' : null }))
  const saved = await reviewCreatorResource({ ...input(), reviewChecklist })
  expect(saved).toMatchObject({ status: 'rejected', approvedAmountCents: 2600, reviewRequestedAt: null })
  expect(priorPayments).toEqual([{ status: 'paid', amountCents: 1300 }])
})

const approval = (amount: number | null = 2000, note: string | null = 'Reduced payout: the CTA did not follow the campaign rules.') => ({
  ...input(), status: 'approved' as const, approvedAmountCents: amount, reviewNote: note,
  reviewChecklist: results().map(item => ({ ...item, met: true, note: null })),
})

test('a reduced legacy payout is saved separately from verified analytics', async () => {
  const saved = await reviewCreatorResource(approval())
  expect(saved).toMatchObject({ approvedAmountCents: 2000, adminViewCountThreshold: 40000, adminUsAudiencePercent: 30 })
})

test('adjusted payouts require a reason and cannot claw back money already sent', async () => {
  await expect(reviewCreatorResource(approval(2000, null))).rejects.toThrow('Explain the payout adjustment')
  await expect(reviewCreatorResource(approval(1200))).rejects.toThrow('cannot be lower than payments already sent')
  expect(writes).toBe(0)
})

test('campaign penalties can reduce unpaid approved earnings without changing paid history', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, approvedAmountCents: 2600, reviewRequestedAt: new Date(), analyticsScreenshotUrl: 'https://example.com/evidence.png' }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null }))
  const saved = await reviewCreatorResource({ ...approval(), reviewChecklist })
  expect(saved).toMatchObject({ approvedAmountCents: 2000 })
  expect(priorPayments).toEqual([{ status: 'paid', amountCents: 1300 }])
})

test('payout schema rejects negative or fractional cents', () => {
  for (const approvedAmountCents of [-1, 1.5, 2_000_000_001]) {
    expect(creatorAdminReviewSchema.safeParse({ ...approval(), approvedAmountCents }).success).toBe(false)
  }
})

test('unchecked requirements do not block approval, with or without a payout penalty', async () => {
  for (const approvedAmountCents of [null, 2000, 3200]) {
    const reviewChecklist = results()
    const saved = await reviewCreatorResource({ ...approval(approvedAmountCents), reviewChecklist })
    expect(saved).toMatchObject({ status: 'approved', approvedAmountCents: approvedAmountCents ?? 3200, reviewChecklist })
  }
})

test('a fully unchecked campaign checklist can be approved and stays unchecked', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.png' }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: false, note: null }))
  expect(await reviewCreatorResource({ ...approval(), reviewChecklist })).toMatchObject({ status: 'approved', approvedAmountCents: 2000, reviewChecklist })
})

test('scheduled transfers block payout changes, including reset to the calculated amount', async () => {
  submission.approvedAmountCents = 2000
  priorPayments.push({ status: 'pending', amountCents: 700 })
  try {
    await expect(reviewCreatorResource(approval(1800))).rejects.toThrow('Resolve the scheduled payment')
    await expect(reviewCreatorResource(approval(null))).rejects.toThrow('Resolve the scheduled payment')
    expect(writes).toBe(0)
  } finally { priorPayments.pop() }
})


test('scheduling a legacy payment uses the saved adjustment, not the calculated rate', async () => {
  submission = { ...submission, approvedAmountCents: 2000, adminViewCountThreshold: 40000, adminUsAudiencePercent: 30 }
  expect(await createCreatorPayment({ submissionId: 'submission', adminViewCountThreshold: 40000, adminUsAudiencePercent: 30, status: 'pending' })).toMatchObject({ amountCents: 2000 })
  await expect(createCreatorPayment({ submissionId: 'submission', adminViewCountThreshold: 100000, adminUsAudiencePercent: 30, status: 'pending' })).rejects.toThrow('Save the updated payout review')
})
