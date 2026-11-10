import { CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT, withCampaignPublishingRules } from '@/lib/creator/campaign-publishing-policy'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { detailedAnalysisVariantTerms } from '@/lib/creator/detailed-analysis-variant'
import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
import { getCreatorSubmissionReviewItems, AUDIENCE_MINIMUM_REJECTION } from '@/lib/creator/submission-review'
import { defaultCreatorSprintTerms } from '@/lib/creator/sprint-defaults'
import { sprintReviewItems, sprintPayoutCents } from '@/lib/creator/sprints'
import { TIKTOK_ANCHOR_REQUIREMENT } from '@/lib/creator/post-guidance'

let submission: Record<string, any>
let writes = 0
let otherPendingCents = 0
let poolBudgetCents = 100000
const priorPayments = [{ status: 'paid', amountCents: 1300 }]
const tx = {
  execute: async () => [{ id: 'budget-owner', budget_cents: poolBudgetCents, terms: {}, cents: submission.approvedAmountCents || 0, amount_cents: 0, other_pending_cents: otherPendingCents }],
  query: { creatorSubmissions: { findFirst: async () => undefined, findMany: async () => [submission] }, creatorPayments: { findMany: async () => priorPayments.map(payment => ({ submissionId: submission.id, ...payment })), findFirst: async () => undefined }, creatorProfiles: { findFirst: async () => ({ id: 'creator', authStatus: 'pending', paymentOption: 'paypal', paypalEmail: 'creator@example.com', bundledPayouts: false }) } },
  select: (fields?: unknown) => ({ from: (table: unknown) => ({ where: () => fields
    ? Promise.resolve([{ cents: submission.approvedAmountCents || 0 }])
    : { for: async () => table === schema.creatorSprints ? [{ id: 'campaign', budgetCents: 100000 }] : table === schema.creatorProfiles ? [{ id: 'creator', authStatus: 'pending', paymentOption: 'paypal', paypalEmail: 'creator@example.com' }] : [submission] } }) }),
  update: () => ({ set: (values: unknown) => ({ where: () => ({ returning: async () => { writes++; submission = { ...submission, ...values as object }; return [submission] } }) }) }),
  insert: () => ({ values: (values: object) => ({ returning: async () => [{ id: 'payment', ...values }] }) }),
}
mock.module('@/lib/db', () => ({ schema, db: {
  query: { creatorSubmissions: { findFirst: async () => submission } },
  transaction: async (fn: (tx: unknown) => unknown) => fn(tx),
} }))
mock.module('@/lib/creator/bonus-service', () => ({ refreshCreatorBonuses: async () => {} }))
const { creatorAdminReviewSchema, reviewCreatorResource, createCreatorPayment } = await import('./creator-service')
const results = () => getCreatorSubmissionReviewItems('custom-video-v1').map(({ id }, i) => ({ id, met: i !== 0, note: i === 0 ? 'Show the CTA within 2–3 seconds.' : null }))
const input = () => {
  const parsed = creatorAdminReviewSchema.parse({ resource: 'submission', id: 'submission', status: 'rejected', adminViewCountThreshold: 40000, adminUsAudiencePercent: 30, reviewChecklist: results() })
  if (parsed.resource !== 'submission') throw new Error('Expected submission input')
  return parsed
}
beforeEach(() => { priorPayments.splice(0, priorPayments.length, { status: 'paid', amountCents: 1300 }); submission = { id: 'submission', creatorProfileId: 'creator', analyticsStorageKey: 'current-evidence', formatId: 'custom-video-v1', status: 'pending', reviewNote: null }; writes = 0; otherPendingCents = 0; poolBudgetCents = 100000 })

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
  manualAudienceConfirmed: true, audienceEvidenceKey: 'current-evidence',
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

test('campaign approval cannot bypass an unreadable audience without manual confirmation', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null }))
  await expect(reviewCreatorResource({ ...approval(), manualAudienceConfirmed: false, reviewChecklist })).rejects.toThrow('Audience needs manual review')
  expect(writes).toBe(0)
})

test('automatic campaign approval uses checked audience and views and records their sources', async () => {
  const terms = defaultCreatorSprintTerms()
  const views = input().adminViewCountThreshold
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.mp4',
    audienceCheck: { version: 1, status: 'verified', storageKey: 'current-evidence', percent: 60, minimumPercent: 59.95, maximumPercent: 90,
      metrics: { totalViews: views, totalViewsExact: true, totalViewers: null, averageWatchTimeSeconds: null, age: [] },
      metricsVerified: { totalViews: true, totalViewsExact: true } } }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null }))
  const saved = await reviewCreatorResource({ ...approval(), adminUsAudiencePercent: 60, manualAudienceConfirmed: false, reviewChecklist }, 'reviewer')
  expect(saved).toMatchObject({ adminUsAudiencePercent: 60, adminViewCountThreshold: views,
    audienceCheck: { review: { source: 'automatic', percent: 60, views, viewsSource: 'automatic', reviewerId: 'reviewer' } } })
})

test('even an explicit manual override cannot approve a replaced recording', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null }))
  await expect(reviewCreatorResource({ ...approval(), audienceEvidenceKey: 'old-evidence', reviewChecklist })).rejects.toThrow('recording changed')
  expect(writes).toBe(0)
})

test('displayed-country approval calculates the saved Tier C rate without allocating Other', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.mp4',
    audienceCheck: { version: 1, basis: 'displayed_countries', status: 'verified', storageKey: 'current-evidence',
      percent: 18.7, otherPercent: 61.3, minimumPercent: 18.65, maximumPercent: 80.05, countries: [
        { code: 'US', name: 'United States', percent: 18.7, precision: 1, frameIds: ['country'] },
        { code: 'BR', name: 'Brazil', percent: 20, precision: 1, frameIds: ['country'] },
      ] } }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null }))
  const saved = await reviewCreatorResource({ ...approval(null, null), adminViewCountThreshold: 50000,
    adminUsAudiencePercent: 18.7, manualAudienceConfirmed: false, reviewChecklist }, 'reviewer')
  expect(saved).toMatchObject({ approvedAmountCents: 1400, adminUsAudiencePercent: 18.7,
    audienceCheck: { review: { source: 'automatic', percent: 18.7 } } })
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

test('an open pre-pause checklist can approve exceptions and a reduced payout', async () => {
  const terms = defaultCreatorSprintTerms()
  terms.rules.push(TIKTOK_ANCHOR_REQUIREMENT)
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.png' }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1', true).map(({ id }) => ({ id, met: false, note: null }))
  const saved = await reviewCreatorResource({ ...approval(), reviewChecklist })
  expect(saved).toMatchObject({ status: 'approved', approvedAmountCents: 2000,
    reviewChecklist: sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: false, note: null })),
  })
  expect(reviewChecklist.length).toBeGreaterThan(submission.reviewChecklist.length)
})

test('missing current, duplicate, or unknown review items cannot silently pass approval', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.png' }
  const items = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: false, note: null }))
  for (const reviewChecklist of [items.slice(1), [...items, items[0]], [...items, { id: 'unknown', met: false, note: null }]]) {
    await expect(reviewCreatorResource({ ...approval(), reviewChecklist })).rejects.toThrow('Refresh the page and reopen')
  }
  expect(writes).toBe(0)
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

 test('Tier C audience alone can explain a campaign rejection and persists for the creator', async () => {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms }
  const reviewChecklist = [
    ...sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null })),
    { id: AUDIENCE_MINIMUM_REJECTION.id, met: false, note: 'Verified Tier 1 audience: 7.4%.' },
  ]
  const saved = await reviewCreatorResource({ ...input(), adminUsAudiencePercent: 7.4, reviewChecklist })
  expect(saved).toMatchObject({ status: 'rejected', reviewChecklist })
 })
 test('legacy submissions also preserve the Tier C audience rejection reason', async () => {
  const reviewChecklist = [
    ...results().map(item => ({ ...item, met: true, note: null })),
    { id: AUDIENCE_MINIMUM_REJECTION.id, met: false, note: null },
  ]
  expect(await reviewCreatorResource({ ...input(), adminUsAudiencePercent: null, reviewChecklist })).toMatchObject({ status: 'rejected', reviewChecklist })
 })


function zeroPayoutReview() {
  const terms = defaultCreatorSprintTerms()
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  return { ...approval(null, 'Verified Tier 1 audience is 7.4%, below the campaign minimum.'), adminViewCountThreshold: 20000, adminUsAudiencePercent: 7.4,
    reviewChecklist: sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null })) }
}

test('below-minimum audience can be approved at zero with a creator-visible explanation', async () => {
  const review = zeroPayoutReview()
  priorPayments.length = 0
  expect(await reviewCreatorResource(review)).toMatchObject({ status: 'approved', approvedAmountCents: 0, adminUsAudiencePercent: 7.4, reviewNote: review.reviewNote })
})

test('a zero-eligibility approval requires an explanation and cannot grant positive earnings', async () => {
  const review = zeroPayoutReview()
  priorPayments.length = 0
  await expect(reviewCreatorResource({ ...review, reviewNote: ' ' })).rejects.toThrow('Explain why this video receives no payment')
  await expect(reviewCreatorResource({ ...review, approvedAmountCents: 100 })).rejects.toThrow('Eligible views and audience are required')
  expect(writes).toBe(0)
})

test('a zero-payout adjustment cannot erase previously sent payments', async () => {
  const review = zeroPayoutReview()
  await expect(reviewCreatorResource({ ...review, approvedAmountCents: 0 })).rejects.toThrow('cannot be lower than payments already sent')
  expect(priorPayments).toEqual([{ status: 'paid', amountCents: 1300 }])
  expect(writes).toBe(0)
})


test('a fully paid $15 rereview saves unchanged earnings without another payment or explanation', async () => {
  const terms = defaultCreatorSprintTerms()
  terms.milestones = [{ views: 20000, amountCents: 1500 }]
  priorPayments.splice(0, priorPayments.length, { status: 'paid', amountCents: 1500 })
  submission = { ...submission, status: 'in_review', sprintId: 'campaign', sprintTerms: terms, approvedAmountCents: 1500, reviewRequestedAt: new Date(), analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1').map(({ id }) => ({ id, met: true, note: null }))
  expect(await reviewCreatorResource({ ...approval(null, null), reviewChecklist })).toMatchObject({ status: 'approved', approvedAmountCents: 1500, reviewRequestedAt: null })
  expect(priorPayments).toEqual([{ status: 'paid', amountCents: 1500 }])
  await expect(createCreatorPayment({ submissionId: 'submission', adminViewCountThreshold: 40000, adminUsAudiencePercent: 30, status: 'pending' })).rejects.toThrow()
})


const detailedTerms = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(campaign => campaign.key === 'detailed-analysis')!)
const mgcTerms = detailedAnalysisVariantTerms(detailedTerms, 'bd0d7a74-3c39-44dd-98ec-21bf6667a714')
for (const [version, terms, amounts] of [
  ['original', detailedTerms, [4000, 7000, 12000]],
  ['MGC', mgcTerms, [3000, 6500, 6500]],
] as const) {
  for (const [index, views] of [50000, 100000, 300000].entries()) {
    test(`${version} admin approval and payment use its saved campaign rates at ${views} views`, async () => {
      priorPayments.length = 0
      const formatId = terms.formats[0].id
      submission = { ...submission, creatorProfileId: 'creator', formatId, sprintId: version, sprintTerms: structuredClone(terms), analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
      const reviewChecklist = sprintReviewItems(terms, formatId).map(({ id }) => ({ id, met: true, note: null }))
      const saved = await reviewCreatorResource({ ...approval(null, null), adminViewCountThreshold: views, adminUsAudiencePercent: 32, reviewChecklist })
      expect(saved).toMatchObject({ approvedAmountCents: amounts[index], sprintId: version, sprintTerms: terms })
      const payment = await createCreatorPayment({ submissionId: 'submission', adminViewCountThreshold: views, adminUsAudiencePercent: 32, status: 'pending' })
      expect(payment.amountCents).toBe(amounts[index])
    })
  }
}
test('MGC rereview pays only the additional earnings at its own audience-adjusted rate', async () => {
  priorPayments.splice(0, priorPayments.length, { status: 'paid', amountCents: 3000 })
  submission = { ...submission, creatorProfileId: 'creator', formatId: mgcTerms.formats[0].id, sprintId: 'MGC', sprintTerms: structuredClone(mgcTerms), status: 'in_review', approvedAmountCents: 3000, reviewRequestedAt: new Date(), analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  const reviewChecklist = sprintReviewItems(mgcTerms, mgcTerms.formats[0].id).map(({ id }) => ({ id, met: true, note: null }))
  expect(await reviewCreatorResource({ ...approval(null, null), adminViewCountThreshold: 100000, adminUsAudiencePercent: 22.5, reviewChecklist })).toMatchObject({ approvedAmountCents: 4225 })
  expect(await createCreatorPayment({ submissionId: 'submission', adminViewCountThreshold: 100000, adminUsAudiencePercent: 22.5, status: 'pending' })).toMatchObject({ amountCents: 1225 })
})


test('MGC approvals protect other pending reservations in the shared original budget', async () => {
  priorPayments.length = 0
  poolBudgetCents = 7000
  otherPendingCents = 1000
  submission = { ...submission, creatorProfileId: 'creator', formatId: mgcTerms.formats[0].id, sprintId: 'MGC', sprintTerms: mgcTerms, analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  const reviewChecklist = sprintReviewItems(mgcTerms, mgcTerms.formats[0].id).map(({ id }) => ({ id, met: true, note: null }))
  await expect(reviewCreatorResource({ ...approval(null,null), adminViewCountThreshold:100000, adminUsAudiencePercent:32, reviewChecklist })).rejects.toThrow('pending requests')
  expect(writes).toBe(0)
  otherPendingCents = 500
  expect(await reviewCreatorResource({ ...approval(null,null), adminViewCountThreshold:100000, adminUsAudiencePercent:32, reviewChecklist })).toMatchObject({approvedAmountCents:6500})
})


test('grace-period publishing failures cannot be used as the sole reason to reject a campaign video', async () => {
  const terms = withCampaignPublishingRules(defaultCreatorSprintTerms())
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, createdAt: new Date('2026-11-10T00:00:00Z') }
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1', true).map(item => ({ id: item.id, met: ![CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT].includes(item.label), note: null }))
  await expect(reviewCreatorResource({ ...input(), reviewChecklist })).rejects.toThrow('Select at least one rejection reason')
  expect(writes).toBe(0)
})

test('a grace-period campaign video earns its normal rate despite missing the new links', async () => {
  const terms = withCampaignPublishingRules(defaultCreatorSprintTerms())
  submission = { ...submission, sprintId: 'campaign', sprintTerms: terms, createdAt: new Date('2026-11-18T00:00:00Z'), postedAt: new Date('2026-11-10T00:00:00Z'), analyticsScreenshotUrl: 'https://example.com/evidence.mp4' }
  priorPayments.length = 0
  const reviewChecklist = sprintReviewItems(terms, 'custom-video-v1', true).map(item => ({ id: item.id, met: ![CAMPAIGN_ANCHOR_REQUIREMENT, CAMPAIGN_BIO_LINK_REQUIREMENT].includes(item.label), note: null }))
  const saved = await reviewCreatorResource({ ...approval(null, null), adminUsAudiencePercent: 40, reviewChecklist })
  expect(saved.approvedAmountCents).toBe(sprintPayoutCents(terms, 40000, 40))
  expect(saved.reviewChecklist.some((item: { id: string }) => reviewChecklist.filter(item => !item.met).some(failed => failed.id === item.id))).toBe(false)
})
