import { expect, test } from 'bun:test'
import type { AdminDashboard, AdminPayment, AdminSubmission } from '@/components/admin/creator-types'
import { buildCreatorPerformance, performanceDay, viewCpm, PERFORMANCE_EXCLUDED_CREATOR_IDS } from './creator-performance'

const now = new Date('2026-10-21T20:00:00Z')
const options = { days: 7, platform: 'all', now }
const post = (id: string, changes: Partial<AdminSubmission> = {}) => ({ id, creatorProfileId: 'creator', creatorName: 'Creator', platform: 'tiktok', createdAt: '2026-10-20T18:00:00Z', sprintId: 'sprint', status: 'approved', approvedAmountCents: 1000, viewCountThreshold: 20000, adminViewCountThreshold: 20000, adminUsAudiencePercent: 30, ...changes } as AdminSubmission)
const payment = (id: string, changes: Partial<AdminPayment> = {}) => ({ id, submissionId: 'one', creatorProfileId: 'creator', amountCents: 1000, currency: 'USD', status: 'paid', paidAt: '2026-10-21T18:00:00Z', ...changes } as AdminPayment)
const data = (submissions: AdminSubmission[], payments: AdminPayment[] = []) => ({ submissions, payments, creators: [] } as Pick<AdminDashboard, 'submissions' | 'payments' | 'creators'>)

test('views follow original submission day; later cash and rereview totals do not create another post', () => {
  const report = buildCreatorPerformance(data([post('one', { adminViewCountThreshold: 100000, viewCountThreshold: 30000, approvedAmountCents: 6500 })], [payment('old', { amountCents: 1500 }), payment('new', { amountCents: 5000 })]), options)
  expect(report.total.posts).toBe(1)
  expect(report.total.reportedViews).toBe(100000)
  expect(report.total.earnedCents).toBe(6500)
  expect(report.total.paidCents).toBe(6500)
  expect(report.total.unpaidCents).toBe(0)
  expect(report.daily.find(r => r.day === '2026-10-20')).toMatchObject({ reportedViews: 100000, earned: 65, cashPaid: 0 })
  expect(report.daily.find(r => r.day === '2026-10-21')).toMatchObject({ reportedViews: 0, cashPaid: 65, cpm: null })
})

test('CPM is weighted and rejected views do not dilute approved cost', () => {
  const report = buildCreatorPerformance(data([post('one'), post('two', { adminViewCountThreshold: 100000, approvedAmountCents: 2000 }), post('rejected', { status: 'rejected', adminViewCountThreshold: 1000000, approvedAmountCents: null })]), options)
  expect(report.total.costViews).toBe(120000)
  expect(report.total.reportedViews).toBe(1120000)
  expect(viewCpm(report.total.earnedCents, report.total.costViews)).toBe(0.25)
  expect(viewCpm(0, 0)).toBeNull()
  expect(viewCpm(0, 20000)).toBe(0)
})

test('all-time creators and period platform rows reconcile; platform filter also filters payments', () => {
  const source = data([post('one'), post('two', { creatorProfileId: 'second', creatorName: 'Second', platform: 'instagram', createdAt: '2026-09-01T18:00:00Z' })], [payment('one-paid'), payment('two-paid', { submissionId: 'two' })])
  const report = buildCreatorPerformance(source, options)
  expect(report.total.posts).toBe(1)
  expect(report.allTime.posts).toBe(2)
  expect(report.creators.reduce((sum, c) => sum + c.reportedViews, 0)).toBe(report.allTime.reportedViews)
  expect(report.platforms.reduce((sum, p) => sum + p.earnedCents, 0)).toBe(report.total.earnedCents)
  expect(report.cashPaidCents).toBe(2000)
  const instagram = buildCreatorPerformance(source, { ...options, platform: 'instagram' })
  expect(instagram.total.posts).toBe(0)
  expect(instagram.allTime.posts).toBe(1)
  expect(instagram.cashPaidCents).toBe(1000)
  expect(instagram.creators[0]).toMatchObject({ id: 'second', instagramViews: 20000, tiktokViews: 0 })
})

test('partial payouts, penalties and failed transfers keep earned and paid spend separate', () => {
  const report = buildCreatorPerformance(data([post('one', { approvedAmountCents: 750 })], [payment('partial', { amountCents: 250 }), payment('failed', { amountCents: 500, status: 'failed' }), payment('pending', { amountCents: 500, status: 'pending' })]), options)
  expect(report.total).toMatchObject({ earnedCents: 750, paidCents: 250, unpaidCents: 500 })
  expect(report.cashPaidCents).toBe(250)
})

test('non-USD and unlinked payments are excluded; missing payment dates are not invented', () => {
  const report = buildCreatorPerformance(data([post('one')], [payment('eur', { currency: 'EUR' }), payment('unlinked', { submissionId: null }), payment('undated', { amountCents: 500, paidAt: null })]), options)
  expect(report.excludedPayments).toBe(2)
  expect(report.undatedPayments).toBe(1)
  expect(report.total.paidCents).toBe(500)
  expect(report.cashPaidCents).toBe(0)
})

test('Pacific date boundaries, zero days, and empty reports remain correct', () => {
  expect(performanceDay('2026-10-21T02:00:00Z')).toBe('2026-10-20')
  expect(performanceDay('2026-03-08T09:30:00Z')).toBe('2026-03-08')
  expect(performanceDay('invalid')).toBeNull()
  const report = buildCreatorPerformance(data([]), options)
  expect(report.daily).toHaveLength(7)
  expect(report.daily.every(row => row.reportedViews === 0 && row.cpm === null)).toBe(true)
  expect(buildCreatorPerformance(data([]), { ...options, days: null }).daily).toHaveLength(1)
})

test('historical TikTok and Instagram Reels labels join the same platform buckets', () => {
  const source = data([post('one', { platform: 'TikTok' }), post('two', { platform: 'Instagram Reels' })])
  const report = buildCreatorPerformance(source, options)
  expect(report.creators[0]).toMatchObject({ tiktokViews: 20000, instagramViews: 20000 })
  expect(report.platforms.map(p => p.platform).sort()).toEqual(['instagram', 'tiktok'])
  expect(buildCreatorPerformance(source, { ...options, platform: 'instagram' }).allTime.posts).toBe(1)
})

test('experimental creators are excluded from every view, spend, cash and creator breakdown', () => {
  const experiments = PERFORMANCE_EXCLUDED_CREATOR_IDS.map((creatorProfileId, i) => post(`experiment-${i}`, { creatorProfileId, platform: i === 1 ? 'Instagram Reels' : 'TikTok' }))
  const transfers = experiments.map(p => payment(`paid-${p.id}`, { creatorProfileId: p.creatorProfileId, submissionId: p.id }))
  const report = buildCreatorPerformance(data([post('real'), ...experiments], [payment('real-paid', { submissionId: 'real' }), ...transfers]), options)
  expect(report.total).toMatchObject({ posts: 1, reportedViews: 20000, earnedCents: 1000, paidCents: 1000 })
  expect(report.allTime).toEqual(report.total)
  expect(report.creators.map(c => c.id)).toEqual(['creator'])
  expect(report.platforms).toHaveLength(1)
  expect(report.cashPaidCents).toBe(1000)
  expect(report.daily.reduce((sum, d) => sum + d.reportedViews,0)).toBe(20000)
  expect(buildCreatorPerformance(data(experiments,transfers), { ...options, days: null, platform: 'instagram' }).allTime.posts).toBe(0)
})


test('period creator rows reconcile to period totals while all-time payout balances remain separate', () => {
  const source = data([post('recent'), post('old', { creatorProfileId: 'old-creator', creatorName: 'Old Creator', createdAt: '2026-09-01T18:00:00Z' })], [payment('old-paid', { submissionId: 'old', creatorProfileId: 'old-creator', amountCents: 300 })])
  const report = buildCreatorPerformance(source, options)
  expect(report.periodCreators.map(row => row.id)).toEqual(['creator'])
  expect(report.periodCreators.reduce((sum, row) => sum + row.earnedCents, 0)).toBe(report.total.earnedCents)
  expect(report.periodCreators.reduce((sum, row) => sum + row.reportedViews, 0)).toBe(report.total.reportedViews)
  expect(report.creators).toHaveLength(2)
  expect(report.cashPaidCents).toBe(300)
  expect(report.total.paidCents).toBe(0)
  expect(report.allTime.paidCents).toBe(300)
})

test('database JSON timestamps without offsets retain their stored UTC interpretation', () => {
  expect(performanceDay('2026-10-21T02:00:00')).toBe('2026-10-20')
  expect(performanceDay('2026-01-01T07:59:59')).toBe('2025-12-31')
})
