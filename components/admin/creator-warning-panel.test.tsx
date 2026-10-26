import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { CreatorWarningPanel } from './creator-warning-panel'
import type { AdminCreator } from './creator-types'

test('shows active and resolved warnings as admin-only information', () => {
  const creator = {
    id: 'creator', displayName: 'Creator', email: 'creator@example.com', image: null, primaryContact: null, authStatus: 'verified', paymentOption: 'paypal', paypalEmail: 'creator@example.com', cryptoNetwork: null, cryptoWalletAddress: null, accountCount: 1, attribution: {}, createdAt: '2026-10-01',
    warnings: [
      { id: 'active', creatorProfileId: 'creator', note: 'Verify analytics carefully.', createdByEmail: 'admin@example.com', createdAt: '2026-10-25', resolvedAt: null, resolvedByEmail: null },
      { id: 'resolved', creatorProfileId: 'creator', note: 'Old concern.', createdByEmail: 'admin@example.com', createdAt: '2026-10-20', resolvedAt: '2026-10-21', resolvedByEmail: 'reviewer@example.com' },
    ],
  } as AdminCreator
  const html = renderToStaticMarkup(<CreatorWarningPanel creator={creator} onRefresh={async () => {}} />)
  expect(html).toContain('Admin only. The creator cannot see these warnings.')
  expect(html).toContain('Verify analytics carefully.')
  expect(html).toContain('Resolved warning history (1)')
  expect(html).toContain('Add warning')
})
