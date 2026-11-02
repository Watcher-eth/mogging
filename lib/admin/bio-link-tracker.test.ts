import { expect, test } from 'bun:test'
import type { AdminSubmission } from '@/components/admin/creator-types'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import { bioLinkMonth, buildBioLinkTracker } from './bio-link-tracker'

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
