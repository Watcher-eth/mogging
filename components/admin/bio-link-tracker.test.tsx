import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BioLinkTracker } from './bio-link-tracker'
import { bioLinkMonth } from '@/lib/admin/bio-link-tracker'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'
import type { AdminAccount, AdminSubmission } from './creator-types'

test('renders account history, partial months, and consistency using only active months', () => {
  const year = bioLinkMonth(new Date())!.slice(0, 4)
  const account = { id: 'account', handle: 'creator', creatorName: 'Creator', platform: 'tiktok', lastActiveAt: '2026-10-30T12:00:00Z' } as AdminAccount
  const video = { socialAccountId: 'account', sprintId: 'launch', sprintTerms: launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), exclusivityConfirmed: true }
  const submissions = [
    { ...video, id: 'one', createdAt: `${year}-09-25T12:00:00Z` },
    { ...video, id: 'two', createdAt: `${year}-10-25T12:00:00Z` },
    { ...video, id: 'three', createdAt: `${year}-10-26T12:00:00Z`, exclusivityConfirmed: false },
  ] as AdminSubmission[]
  const html = renderToStaticMarkup(<BioLinkTracker accounts={[account]} submissions={submissions} onSelectSubmission={() => {}} onSelectAccount={() => {}} />)
  expect(html).toContain(`Sep ${year}: 1 of 1 videos verified`)
  expect(html).toContain(`Oct ${year}: 1 of 2 videos verified`)
  expect(html).toContain(`Jan ${year}: no eligible videos`)
  expect(html).toContain('50%')
  expect(html).toContain('1/2')
  expect(html).toContain('active months')
  expect(html).toContain('Previous year')
  expect(html).toContain('Next year')
  expect(html).toContain('Last active')
  expect(html).toContain('Creator portal')
  expect(html).toContain('View @creator and all linked accounts')
  expect(html).toContain('Search accounts')
  expect(html).toContain('Sort accounts')
  expect(html).toContain('aria-sort="descending"')
  expect(html).toContain('Last active · newest first')
})

test('empty state does not invent verification history', () => {
  const html = renderToStaticMarkup(<BioLinkTracker accounts={[]} submissions={[]} onSelectSubmission={() => {}} onSelectAccount={() => {}} />)
  expect(html).toContain('Connect a social account')
  expect(html).not.toContain('100%')
})
