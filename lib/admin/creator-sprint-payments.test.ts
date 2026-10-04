import { beforeEach, expect, mock, test } from 'bun:test'
import * as schema from '@/lib/db/schema'
import { sprintReviewItems, type SprintTerms } from '@/lib/creator/sprints'
const terms: SprintTerms = {
  milestones: [{ views: 5000, amountCents: 1000 }],
  minimumTier1Percent: 20,
  maximumTier1Percent: 40,
  platforms: ['tiktok'],
  rules: ['Keep public'],
  formats: [
    {
      id: 'f',
      name: 'Video',
      shortDescription: 'Show app',
      active: true,
      elements: [{ title: 'Hook', detail: 'Open clearly' }],
      requirements: ['Show Mogging'],
      notAllowed: [],
    },
  ],
}
let submission: any
let payment: any
let budget = 1000
let used = 0
let locks: unknown[] = []
let messages: any[] = []
const query = {
  creatorSubmissions: { findFirst: async () => submission },
  creatorPayments: { findFirst: async () => payment },
  creatorProfiles: {
    findFirst: async () => ({
      id: 'creator',
      authStatus: 'verified',
      paymentOption: 'paypal',
      paypalEmail: 'creator@example.com',
    }),
  },
}
const tx = {
  query,
  select: () => ({
    from: (table: unknown) => ({
      where: () => ({
        for: async () => {
          locks.push(table)
          return table === schema.creatorSprints
            ? [{ id: 'sprint', budgetCents: budget }]
            : table === schema.creatorPayments
              ? [payment]
              : [submission]
        },
        then: (resolve: any) => resolve([{ cents: used }]),
      }),
    }),
  }),
  update: (table: unknown) => ({
    set: (values: any) => ({
      where: () => ({
        returning: async () => {
          if (table === schema.creatorSubmissions)
            submission = { ...submission, ...values }
          else payment = { ...payment, ...values }
          return [table === schema.creatorSubmissions ? submission : payment]
        },
        then: (resolve: any) => {
          submission = { ...submission, ...values }
          return resolve([])
        },
      }),
    }),
  }),
  insert: (table: unknown) => ({
    values: (values: any) => table === schema.creatorSubmissionMessages ? Promise.resolve(messages.push(values)) : ({
      returning: async () => {
        payment = { id: 'payment', ...values }
        return [payment]
      },
    }),
  }),
}
mock.module('@/lib/db', () => ({
  schema,
  db: { ...tx, transaction: async (fn: any) => fn(tx) },
}))
mock.module('@/lib/creator/attribution', () => ({
  ensureCreatorTrackingLink: async () => null,
  getCreatorAttributionReport: async () => [],
}))
const { reviewCreatorResource, createCreatorPayment } =
  await import('./creator-service')
const review = {
  resource: 'submission' as const,
  id: 'submission',
  status: 'approved' as const,
  adminViewCountThreshold: 5000,
  adminUsAudiencePercent: 40,
  reviewChecklist: sprintReviewItems(terms, 'f').map((item) => ({
    id: item.id,
    met: true,
    note: null,
  })),
}
beforeEach(() => {
  submission = {
    id: 'submission',
    creatorProfileId: 'creator',
    sprintId: 'sprint',
    sprintTerms: structuredClone(terms),
    formatId: 'f',
    status: 'pending',
    approvedAmountCents: null,
  }
  payment = undefined
  budget = 1000
  used = 0
  locks = []
  messages = []
})
test('approval reserves saved sprint rates and locks the budget and submission', async () => {
  const result = await reviewCreatorResource(review)
  expect(result).toHaveProperty('approvedAmountCents', 1000)
  expect(locks).toEqual([schema.creatorSubmissions, schema.creatorSprints])
})
test('approval cannot exceed remaining budget or pass unmet campaign requirements', async () => {
  used = 1
  await expect(reviewCreatorResource(review)).rejects.toThrow(
    'exceed the sprint budget',
  )
  expect(submission.status).toBe('pending')
  used = 0
  await expect(
    reviewCreatorResource({
      ...review,
      reviewChecklist: review.reviewChecklist.map((item, i) => ({
        ...item,
        met: i !== 0,
      })),
    }),
  ).rejects.toThrow('every sprint requirement')
})
test('re-review replaces its own reservation instead of counting it twice', async () => {
  submission = { ...submission, status: 'approved', approvedAmountCents: 1000 }
  used = 1000
  expect(await reviewCreatorResource(review)).toHaveProperty(
    'approvedAmountCents',
    1000,
  )
})
test('payment uses approved cents and blocks duplicate payments and unsaved repricing', async () => {
  await reviewCreatorResource(review)
  const input = {
    submissionId: 'submission',
    adminViewCountThreshold: 5000,
    adminUsAudiencePercent: 40,
    status: 'pending' as const,
  }
  await expect(
    createCreatorPayment({ ...input, adminUsAudiencePercent: 20 }),
  ).rejects.toThrow('approved earnings values')
  const created = await createCreatorPayment(input)
  expect(created.amountCents).toBe(1000)
  await expect(createCreatorPayment(input)).rejects.toThrow('already exists')
  await expect(reviewCreatorResource(review)).rejects.toThrow(
    'cannot be re-reviewed',
  )
})
test('sent payments complete the video and cannot be reversed or edited', async () => {
  await reviewCreatorResource(review)
  await createCreatorPayment({
    submissionId: 'submission',
    adminViewCountThreshold: 5000,
    adminUsAudiencePercent: 40,
    status: 'pending',
  })
  await reviewCreatorResource({
    resource: 'payment',
    id: 'payment',
    status: 'paid',
  })
  expect(submission.status).toBe('paid')
  await expect(
    reviewCreatorResource({
      resource: 'payment',
      id: 'payment',
      status: 'pending',
    }),
  ).rejects.toThrow('cannot be changed')
  await expect(
    reviewCreatorResource({
      resource: 'payment',
      id: 'payment',
      status: 'paid',
      amountCents: 999,
    }),
  ).rejects.toThrow('cannot be changed')
})

test('review feedback enters the conversation once and clearing notes keeps history', async () => {
  await reviewCreatorResource({ ...review, reviewNote: 'Minimum views are 20k.' }, 'admin')
  expect(messages).toHaveLength(1)
  expect(messages[0]).toMatchObject({ submissionId: 'submission', authorRole: 'team', authorUserId: 'admin', body: 'Minimum views are 20k.' })
  await reviewCreatorResource({ ...review, reviewNote: 'Minimum views are 20k.' }, 'admin')
  expect(messages).toHaveLength(1)
  await reviewCreatorResource({ ...review, reviewNote: null }, 'admin')
  expect(messages).toHaveLength(1)
})
