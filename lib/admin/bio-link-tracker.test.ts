import { expect, test } from 'bun:test'
import type { AdminAccount, AdminSubmission } from '@/components/admin/creator-types'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { accountConsistency, activityDate, bioLinkMonth, buildBioLinkTracker, filterAndSortAccounts, lastActiveLabel } from './bio-link-tracker'

const accounts = [
  { id: 'a', handle: 'alpha', creatorName: 'Jane Smith', creatorEmail: 'jane@example.com', platform: 'tiktok', lastActiveAt: '2026-11-02T12:00:00Z', createdAt: '2026-10-01T12:00:00Z' },
  { id: 'b', handle: 'beta', creatorName: 'Alex', creatorEmail: 'alex@example.com', platform: 'instagram', lastActiveAt: '2026-10-30T12:00:00Z', createdAt: '2026-10-02T12:00:00Z' },
  { id: 'c', handle: 'gamma', creatorName: 'Jane Smith', creatorEmail: 'jane@example.com', platform: 'instagram', lastActiveAt: null, createdAt: '2026-10-03T12:00:00Z' },
] as AdminAccount[]

test('sorts activity in either direction, keeps unknown activity last, and leaves input unchanged', () => {
  const tracker = buildBioLinkTracker([])
  const ids = (sort: 'active-desc' | 'active-asc' | 'connected-desc') => filterAndSortAccounts(accounts, tracker, 2026, '', sort).map(account => account.id)
  expect(ids('active-desc')).toEqual(['a', 'b', 'c'])
  expect(ids('active-asc')).toEqual(['b', 'a', 'c'])
  expect(ids('connected-desc')).toEqual(['c', 'b', 'a'])
  expect(accounts.map(account => account.id)).toEqual(['a', 'b', 'c'])
})

test('consistency sorting uses selected-year completed months and distinguishes zero from no history', () => {
  const tracker = buildBioLinkTracker([
    video('a-sep', { socialAccountId: 'a', createdAt: '2026-09-25T12:00:00Z', exclusivityConfirmed: true }),
    video('a-oct', { socialAccountId: 'a' }),
    video('b-oct', { socialAccountId: 'b' }),
    video('b-old', { socialAccountId: 'b', createdAt: '2025-10-25T12:00:00Z', exclusivityConfirmed: true }),
  ])
  expect(accountConsistency(tracker.get('a'), 2026)).toEqual({ active: 2, complete: 1, rate: 0.5 })
  expect(filterAndSortAccounts(accounts, tracker, 2026, '', 'consistency-desc').map(account => account.id)).toEqual(['a', 'b', 'c'])
  expect(filterAndSortAccounts(accounts, tracker, 2026, '', 'consistency-asc').map(account => account.id)).toEqual(['b', 'a', 'c'])
  expect(filterAndSortAccounts(accounts, tracker, 2025, '', 'consistency-desc')[0].id).toBe('b')
})

test('search matches handles, creator names, emails and platforms with multiple case-insensitive terms', () => {
  const tracker = buildBioLinkTracker([])
  const find = (query: string) => filterAndSortAccounts(accounts, tracker, 2026, query, 'active-desc').map(account => account.id)
  expect(find('  @ALPHA  ')).toEqual(['a'])
  expect(find('jane INSTAGRAM')).toEqual(['c'])
  expect(find('alex@example.com')).toEqual(['b'])
  expect(find('missing')).toEqual([])
  expect(find('   ')).toHaveLength(3)
})

test('last activity handles missing dates and displays the creator visit without inventing activity', () => {
  const now = Date.parse('2026-11-02T12:00:00Z')
  expect(lastActiveLabel(null, now)).toBe('Not recorded')
  expect(lastActiveLabel('bad', now)).toBe('Not recorded')
  expect(lastActiveLabel('2026-11-02T11:59:50Z', now)).toBe('Just now')
  expect(lastActiveLabel('2026-11-02T11:55:00Z', now)).toBe('5m ago')
  expect(lastActiveLabel('2026-11-02T10:00:00Z', now)).toBe('2h ago')
  expect(lastActiveLabel('2026-10-30T12:00:00Z', now)).toBe('3d ago')
  expect(activityDate('2026-11-02T12:00:00Z')).toContain('4:00 AM')
})

function video(id: string, overrides: Partial<AdminSubmission> = {}): AdminSubmission {
  return { id, socialAccountId: 'account-a', creatorProfileId: 'creator', createdAt: '2026-10-25T12:00:00Z', sprintId: 'campaign', sprintTerms: launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), exclusivityConfirmed: false, ...overrides } as AdminSubmission
}

test('each video retains its own checkmark and accounts belonging to one creator stay separate', () => {
  const data = [video('one', { exclusivityConfirmed: true }), video('two'), video('three', { socialAccountId: 'account-b', exclusivityConfirmed: true })]
  const tracker = buildBioLinkTracker(data)
  expect(tracker.get('account-a')?.get('2026-10')).toMatchObject({ verified: 1 })
  expect(tracker.get('account-a')?.get('2026-10')?.submissions.map(post => post.id)).toEqual(['one', 'two'])
  expect(tracker.get('account-b')?.get('2026-10')?.verified).toBe(1)
  expect(data[1].exclusivityConfirmed).toBe(false)
})

test('excludes legacy campaigns, unlinked videos, and invalid dates', () => {
  const tracker = buildBioLinkTracker([video('old', { sprintTerms: null }), video('unlinked', { socialAccountId: null }), video('invalid', { createdAt: 'invalid' })])
  expect(tracker.size).toBe(0)
})

test('uses original submission month in Los Angeles, including year boundaries', () => {
  expect(bioLinkMonth('2026-11-01T06:59:00Z')).toBe('2026-10')
  expect(bioLinkMonth('2026-11-01T07:00:00Z')).toBe('2026-11')
  expect(bioLinkMonth('2027-01-01T07:59:00Z')).toBe('2026-12')
  expect(bioLinkMonth('2027-01-01T08:00:00Z')).toBe('2027-01')
  const tracker = buildBioLinkTracker([video('later-review', { exclusivityConfirmed: true, updatedAt: '2026-12-02T12:00:00Z' })])
  expect(tracker.get('account-a')?.has('2026-10')).toBe(true)
  expect(tracker.get('account-a')?.has('2026-12')).toBe(false)
})

test('refreshing from saved video results reflects checks and reversals', () => {
  const data = [video('one')]
  expect(buildBioLinkTracker(data).get('account-a')?.get('2026-10')?.verified).toBe(0)
  expect(buildBioLinkTracker([{ ...data[0], exclusivityConfirmed: true }]).get('account-a')?.get('2026-10')?.verified).toBe(1)
  expect(buildBioLinkTracker(data).get('account-a')?.get('2026-10')?.verified).toBe(0)
})
