import { expect, test } from 'bun:test'
import type { AdminSubmission } from '@/components/admin/creator-types'
import { defaultSubmissionFilters as defaults, filterSubmissions, groupSubmissions, submissionCampaignKey, submissionViews } from './submission-browser'

const post = (overrides: Partial<AdminSubmission>): AdminSubmission => ({
  id: 'a', creatorProfileId: 'creator-a', creatorName: 'Alex García', creatorEmail: 'alex@example.invalid', socialHandle: 'alexlooks',
  title: 'Morning skincare routine', caption: 'My daily progress', platform: 'tiktok', status: 'pending', createdAt: '2026-11-08T12:00:00',
  sprintId: 'campaign-a', sprintName: 'General Looksmaxxing Content', formatId: 'launch-general-looksmaxxing-v1',
  viewCountThreshold: 100000, adminViewCountThreshold: null, ...overrides,
} as AdminSubmission)
test('search combines words across creator, handle, video, caption, and campaign without case or accent sensitivity', () => {
  const items = [post({}), post({ id: 'b', creatorName: 'Sam Taylor', socialHandle: null, caption: null })]
  expect(filterSubmissions(items, { ...defaults, query: ' GARCIA  @alexlooks skincare ' }).map(item => item.id)).toEqual(['a'])
  expect(filterSubmissions(items, { ...defaults, query: ' GARCIA  alexlooks skincare ' }).map(item => item.id)).toEqual(['a'])
  expect(filterSubmissions(items, { ...defaults, query: 'progress looksmaxxing' })).toHaveLength(1)
  expect(filterSubmissions(items, { ...defaults, query: 'garcia missing' })).toHaveLength(0)
  expect(filterSubmissions(items, { ...defaults, query: 'garcia tiktok pending' }).map(item => item.id)).toEqual(['a'])
})
test('search finds exact submission IDs, emails and post links', () => {
  const item = post({ id: 'submission-123', postUrl: 'https://www.tiktok.com/@alexlooks/video/987654' })
  for (const query of ['submission-123', 'alex@example.invalid', '/video/987654']) expect(filterSubmissions([item], { ...defaults, query })).toHaveLength(1)
})
test('status, campaign, category and platform filters intersect', () => {
  const items = [post({}), post({ id: 'b', platform: 'instagram' }), post({ id: 'c', status: 'paid' }), post({ id: 'd', sprintId: 'other-campaign' })]
  expect(filterSubmissions(items, { ...defaults, status: 'pending', campaign: 'campaign-a', category: 'general-looksmaxxing', platform: 'tiktok' }).map(item => item.id)).toEqual(['a'])
})
test('same-named campaigns and creators stay separate when grouped', () => {
  const items = [post({}), post({ id: 'b', sprintId: 'campaign-b', creatorProfileId: 'creator-b' })]
  expect(groupSubmissions(items, 'campaign')).toHaveLength(2)
  expect(groupSubmissions(items, 'creator')).toHaveLength(2)
  expect(groupSubmissions(items, 'category')).toHaveLength(1)
  expect(submissionCampaignKey(post({ sprintId: null, sprintName: null }))).toBe('unassigned')
})
test('review flags distinguish outstanding audience checks, rereviews and unread messages', () => {
  const items = [post({ id: 'rereview', reviewRequestedAt: '2026-11-09' }), post({ id: 'unread', unreadMessages: 2 }),
    post({ id: 'audience', audienceCheck: { version: 1, storageKey: 'recording', status: 'needs_review' } }),
    post({ id: 'resolved', audienceCheck: { status: 'needs_review', review: { decision: 'approved' } } as unknown as AdminSubmission['audienceCheck'] })]
  expect(filterSubmissions(items, { ...defaults, attention: 'rereviews' }).map(item => item.id)).toEqual(['rereview'])
  expect(filterSubmissions(items, { ...defaults, attention: 'unread' }).map(item => item.id)).toEqual(['unread'])
  expect(filterSubmissions(items, { ...defaults, attention: 'audience' }).map(item => item.id)).toEqual(['audience'])
})
test('date filtering includes both complete local calendar days and excludes invalid dates', () => {
  const items = [post({ id: 'start', createdAt: '2026-11-08T00:00:00' }), post({ id: 'end', createdAt: '2026-11-09T23:59:59' }),
    post({ id: 'outside', createdAt: '2026-11-10T00:00:00' }), post({ id: 'invalid', createdAt: 'bad date' })]
  expect(filterSubmissions(items, { ...defaults, from: '2026-11-08', to: '2026-11-09' }).map(item => item.id)).toEqual(['end', 'start'])
})
test('views use verified metrics including zero, with unknown values last', () => {
  const items = [post({ id: 'unknown', viewCountThreshold: null }), post({ id: 'zero', adminViewCountThreshold: 0 }), post({ id: 'verified', adminViewCountThreshold: 200000 })]
  expect(submissionViews(items[1])).toBe(0)
  expect(filterSubmissions(items, { ...defaults, sort: 'views' }).map(item => item.id)).toEqual(['verified', 'zero', 'unknown'])
})
test('sorts deterministically without mutating the dashboard data and puts invalid dates last', () => {
  const items = [post({ id: 'new', createdAt: '2026-11-09' }), post({ id: 'old', createdAt: '2026-11-01' }), post({ id: 'invalid', createdAt: 'invalid' })]
  expect(filterSubmissions(items, { ...defaults, sort: 'oldest' }).map(item => item.id)).toEqual(['old', 'new', 'invalid'])
  expect(items.map(item => item.id)).toEqual(['new', 'old', 'invalid'])
})
