import { expect, test } from 'bun:test'
import { calculateCreatorScores, campaignScorePoints, type ScoreInput, type ScorePost } from './creator-score-policy'
const now = new Date('2026-11-10T20:00:00Z')
const post = (overrides: Partial<ScorePost> = {}): ScorePost => ({ id: 'post', creatorId: 'creator', campaignId: 'general', status: 'approved', views: 100000, audience: 40, postedAt: '2026-11-09T20:00:00Z', terms: { minimumTier1Percent: 15 }, earnedCents: 3000, bioVerified: false, bioCheckedAt: null, accountId: 'account', ...overrides })
const fixture = (overrides: Partial<ScoreInput> = {}): ScoreInput => ({ creators: [{ id: 'creator', name: 'Creator' }], posts: [post()], warnings: [], accounts: [{ id: 'account', creatorId: 'creator', followers: { source: 'public', count: 2000 } }], payments: [], campaigns: [{ id: 'general', name: 'General Looksmaxxing Content' }, { id: 'feature', name: 'Face Feature Comparison' }, { id: 'detailed', name: 'Detailed Facial Analysis' }], ...overrides })
const score = (input: Partial<ScoreInput> = {}) => calculateCreatorScores(fixture(input), now)[0]
const component = (id: string, input: Partial<ScoreInput> = {}) => score(input).components.find(component => component.id === id)!
test('unmeasured finances are neutral placeholders and new creators are unassessed', () => {
  expect(component('conversions')).toMatchObject({ points: 175, maximum: 350, status: 'provisional' })
  expect(component('economics')).toMatchObject({ points: 125, maximum: 250, status: 'provisional' })
  expect(score({ posts: [] })).toMatchObject({ assessed: false, confidence: 'unassessed', total: 325 })
})
test('campaign incentives require approved work, not enrollment', () => {
  expect(campaignScorePoints('Detailed Facial Analysis')).toBe(100)
  const posts = [1, 2, 3].map(id => post({ id: String(id), campaignId: 'detailed' }))
  expect(component('campaigns', { posts }).points).toBe(100)
  expect(component('campaigns', { posts: posts.map(post => ({ ...post, campaignId: 'general' })) }).points).toBe(40)
  expect(component('campaigns', { posts: [post({ campaignId: 'detailed', status: 'pending' })] }).points).toBe(0)
})
test('only reviewed approved reach counts; audience is weighted by verified views', () => {
  const result = score({ posts: [post({ views: 90000, audience: 20 }), post({ id: 'two', views: 10000, audience: 100 }), post({ id: 'pending', status: 'pending', views: 9000000, audience: 100 })] })
  expect(result.metrics.verifiedViews).toBe(100000)
  expect(result.metrics.tier1Percent).toBe(28)
  expect(result.components.find(c => c.id === 'audience')?.points).toBe(70)
})
test('posting points expire by publication date and are capped', () => {
  expect(component('consistency', { posts: [post({ postedAt: '2026-10-01T00:00:00Z' })] }).points).toBe(0)
  expect(component('consistency', { posts: [post({ postedAt: '2026-12-01T00:00:00Z' })] }).points).toBe(0)
  expect(component('consistency', { posts: Array.from({ length: 20 }, (_, id) => post({ id: String(id) })) }).points).toBe(75)
})
test('bio defaults and old checks do not cause retroactive deductions; verified exemptions require evidence', () => {
  expect(component('bio').points).toBe(25)
  expect(component('bio', { posts: [post({ bioCheckedAt: '2026-11-09T12:00:00Z' })] }).points).toBe(25)
  expect(component('bio', { posts: [post({ bioCheckedAt: '2026-11-10T18:00:00Z', bioVerified: true })] }).points).toBe(50)
  expect(component('bio', { posts: [post({ bioCheckedAt: '2026-11-10T18:00:00Z' })] }).points).toBe(25)
  expect(component('bio', { warnings: [{ id: 'bio', creatorId: 'creator', category: 'missing_bio_link', points: 0, submissionId: 'post', resolved: false, createdAt: '2026-11-10T18:00:00Z' }] }).points).toBe(0)
  expect(component('bio', { accounts: [{ id: 'account', creatorId: 'creator', followers: { source: 'public', count: 500 } }] }).points).toBe(50)
  expect(component('bio', { accounts: [{ id: 'account', creatorId: 'creator', followers: { source: 'self_reported', range: 'under_1k' } }] }).points).toBe(25)
})
test('only active confirmed warnings deduct; resolving restores points and legacy notes are unscored', () => {
  const warning = { id: 'warning', creatorId: 'creator', category: 'views_mismatch', points: 40, submissionId: 'post', resolved: false }
  const initial = score()
  expect(score({ warnings: [warning] }).total).toBe(initial.total - 40)
  expect(score({ warnings: [{ ...warning, resolved: true }] }).total).toBe(initial.total)
  expect(score({ warnings: [{ ...warning, category: 'other', points: 0 }] }).total).toBe(initial.total)
  expect(score({ warnings: Array.from({ length: 30 }, (_, id) => ({ ...warning, id: String(id) })) }).total).toBe(0)
})
test('confirmed fraud caps otherwise strong creators', () => {
  const posts = Array.from({ length: 12 }, (_, id) => post({ id: String(id), campaignId: 'detailed', views: 1000000 }))
  expect(score({ posts, warnings: [{ id: 'fraud', creatorId: 'creator', category: 'confirmed_fraud', points: 200, submissionId: null, resolved: false }] }).total).toBe(399)
})
test('compensation includes earned unpaid amounts and bonuses without double counting base', () => {
  expect(score({ payments: [{ creatorId: 'creator', submissionId: 'post', cents: 1000, currency: 'USD' }] }).metrics.committedUsd).toBe(30)
  expect(score({ payments: [{ creatorId: 'creator', submissionId: 'post', cents: 4000, currency: 'USD' }, { creatorId: 'creator', submissionId: null, cents: 500, currency: 'USD' }, { creatorId: 'creator', submissionId: null, cents: 900, currency: 'EUR' }] }).metrics.committedUsd).toBe(45)
})
