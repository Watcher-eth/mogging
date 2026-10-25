import { expect, test } from 'bun:test'
import type { CreatorDashboard, CreatorPayment, CreatorSubmission } from '@/components/creator/types'
import { creatorOverviewMetrics } from './overview'

const dashboard = (submissions: Partial<CreatorSubmission>[] = [], payments: Partial<CreatorPayment>[] = []) => ({ profile: null, submissions: submissions as CreatorSubmission[], payments: payments as CreatorPayment[], socialAccounts: [], communityMetrics: { totalQualifiedViews: 0, totalFirstTimePaidCustomers: 0, totalPaidCents: 0, paidCreators: 0, approvedSubmissions: 0 }, featureFlags: { creatorAccountRequiredForSubmission: true } }) satisfies CreatorDashboard
const post = (values: Partial<CreatorSubmission>): Partial<CreatorSubmission> => ({ id: 'post', createdAt: '2026-10-20T00:00:00Z', status: 'pending', ...values })
const payment = (values: Partial<CreatorPayment>): Partial<CreatorPayment> => ({ id: 'payment', currency: 'USD', status: 'paid', amountCents: 1000, ...values })

test('overview uses reviewed views when available, including zero; rejects do not count toward reach', () => {
  const metrics = creatorOverviewMetrics(dashboard([
    post({ id: 'paid', status: 'paid', viewCountThreshold: 900000, adminViewCountThreshold: 100000 }),
    post({ id: 'approved', status: 'approved', viewCountThreshold: 50000 }),
    post({ id: 'review', status: 'in_review', viewCountThreshold: 10000, adminViewCountThreshold: 0 }),
    post({ id: 'pending', viewCountThreshold: 5000 }),
    post({ id: 'rejected', status: 'rejected', viewCountThreshold: 1000000 }),
  ]))
  expect(metrics.views).toBe(155000)
  expect(metrics.inReview).toBe(2)
  expect(metrics.approved).toBe(2)
  expect(metrics.posts).toHaveLength(4)
})

test('paid includes each settled payment once; bonus breakdown excludes cancelled and foreign currency payments', () => {
  const bonus = { bonusSprintId: 'campaign', bonusKey: 'audience:post:500' }
  const metrics = creatorOverviewMetrics(dashboard([], [
    payment({ id: 'content' }),
    payment({ id: 'bonus-paid', ...bonus, amountCents: 500 }),
    payment({ id: 'bonus-pending', ...bonus, status: 'pending', amountCents: 700 }),
    payment({ id: 'bonus-failed', ...bonus, status: 'failed', amountCents: 100 }),
    payment({ id: 'cancelled', ...bonus, status: 'cancelled', amountCents: 200 }),
    payment({ id: 'eur', ...bonus, currency: 'EUR', amountCents: 5000 }),
    payment({ id: 'content-pending', status: 'pending', amountCents: 1000 }),
  ]))
  expect(metrics.paidCents).toBe(1500)
  expect(metrics.bonusCents).toBe(1300)
  expect(metrics.bonusPaidCents).toBe(500)
  expect(metrics.bonusOutstandingCents).toBe(800)
})

test('a new creator has real zeroes and no invented chart points', () => {
  const metrics = creatorOverviewMetrics(dashboard())
  expect(metrics.views).toBe(0)
  expect(metrics.posts).toEqual([])
  expect(metrics.paidCents).toBe(0)
  expect(metrics.bonusCents).toBe(0)
  expect(metrics.inReview).toBe(0)
  expect(metrics.approved).toBe(0)
})
