import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountOverview } from './social-accounts-panel'
import { Dialog } from '@/components/ui/dialog'
import type { AdminAccount, AdminDashboard, AdminSubmission } from './creator-types'
import { LAUNCH_CAMPAIGNS, launchCampaignTerms } from '@/lib/creator/campaign-launch'

test('account dialog shows all accounts and videos for the selected creator, excluding other creators', () => {
  const account = { id: 'one', creatorProfileId: 'creator', creatorName: 'Creator', creatorEmail: 'creator@example.com', handle: 'main', platform: 'tiktok', status: 'approved', trackingLinkUrl: 'https://mogging.com/r/main', trackingLinkActive: true, reviewNote: 'Checked profile', connectionMethod: 'oauth', lastActiveAt: '2026-11-02T12:00:00Z' } as AdminAccount
  const accounts = [account, { ...account, id: 'two', platform: 'instagram', handle: 'second' }, { ...account, id: 'other', creatorProfileId: 'another-creator', handle: 'privateother' }] as AdminAccount[]
  const submissions = [{ id: 'video', creatorProfileId: 'creator', socialAccountId: 'one', title: 'Selected creator video', status: 'approved', createdAt: '2026-10-25T12:00:00Z', sprintId: 'launch', sprintTerms: launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), exclusivityConfirmed: true }, { id: 'foreign', creatorProfileId: 'another-creator', title: 'Other creator private video' }] as AdminSubmission[]
  const data = { creators: [], accounts, submissions } as unknown as AdminDashboard
  const html = renderToStaticMarkup(<Dialog><AccountOverview account={account} data={data} onReviewAccount={() => {}} onSelectSubmission={() => {}} /></Dialog>)
  expect(html).toContain('@main')
  expect(html).toContain('@second')
  expect(html).toContain('2 linked')
  expect(html).toContain('Selected creator video')
  expect(html).toContain('Bio verified')
  expect(html).toContain('https://mogging.com/r/main')
  expect(html).toContain('Checked profile')
  expect(html).toContain('Review account &amp; analytics')
  expect(html).not.toContain('privateother')
  expect(html).not.toContain('Other creator private video')
})
