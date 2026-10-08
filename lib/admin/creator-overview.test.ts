import { describe, expect, test } from 'bun:test'
import type { AdminAccount, AdminCreator, AdminDashboard, AdminSubmission } from '@/components/admin/creator-types'
import { approvedUnpaidSubmissions, approvalKind, getApprovalQueue, isNewInLastDay, publishedVideoEmbedUrl, walletExplorerUrl } from './creator-overview'

describe('admin overview approvals', () => {
  test('keeps every approval type beyond the former eight-video cutoff', () => {
    const data = {
      submissions: Array.from({ length: 10 }, (_, id) => ({ id: String(id), status: id === 9 ? 'in_review' : 'pending', createdAt: '2026-09-29' } as AdminSubmission)),
      accounts: [
        { id: 'ready', status: 'pending', analyticsVideoUrl: 'recording.mp4', analyticsConfirmedAt: '2026-09-28', createdAt: '2026-09-30' },
        { id: 'incomplete', status: 'pending', createdAt: '2026-09-28' },
      ] as AdminAccount[],
      creators: [
        { id: 'payout', authStatus: 'pending', paymentOption: 'paypal', paypalEmail: 'creator@example.com', createdAt: '2026-09-27' },
        { id: 'registration', authStatus: 'pending', paymentOption: 'paypal', createdAt: '2026-09-27' },
        { id: 'verified', authStatus: 'verified', createdAt: '2026-09-27' },
      ] as AdminCreator[],
    } as AdminDashboard
    const queue = getApprovalQueue(data)
    expect(queue).toHaveLength(12)
    expect(queue[0].item.id).toBe('ready')
    expect(queue.at(-1)?.item.id).toBe('payout')
    expect(queue.map(approvalKind)).toContain('account')
    expect(queue.map(approvalKind)).toContain('payout')
    expect(queue.some((target) => target.item.id === 'registration')).toBe(false)
    expect(queue.some((target) => target.item.id === 'incomplete')).toBe(false)
  })

  test('uses a rolling 24-hour window and excludes invalid or future timestamps', () => {
    const now = Date.parse('2026-09-29T12:00:00Z')
    expect(isNewInLastDay('2026-09-28T12:00:01Z', now)).toBe(true)
    expect(isNewInLastDay('2026-09-28T12:00:00Z', now)).toBe(false)
    expect(isNewInLastDay('2026-09-29T12:00:01Z', now)).toBe(false)
    expect(isNewInLastDay('invalid', now)).toBe(false)
  })

  test('opens the selected network and never guesses an explorer for other networks', () => {
    expect(walletExplorerUrl('BASE', '0x123')).toBe('https://basescan.org/address/0x123')
    expect(walletExplorerUrl('Ethereum', '0x123')).toBe('https://etherscan.io/address/0x123')
    expect(walletExplorerUrl('USDC on Solana', 'abc')).toBe('https://solscan.io/account/abc')
    expect(walletExplorerUrl('Other', 'abc')).toBeNull()
    expect(walletExplorerUrl(null, 'abc')).toBeNull()
  })

  test('embeds only supported published post URLs with usable video identifiers', () => {
    expect(publishedVideoEmbedUrl('https://www.tiktok.com/@creator/video/12345')).toBe('https://www.tiktok.com/player/v1/12345')
    expect(publishedVideoEmbedUrl('https://www.instagram.com/reel/AbC_123/')).toBe('https://www.instagram.com/reel/AbC_123/embed/')
    expect(publishedVideoEmbedUrl('https://vm.tiktok.com/short/')).toBeNull()
    expect(publishedVideoEmbedUrl('https://evil.example/reel/123/')).toBeNull()
    expect(publishedVideoEmbedUrl('javascript:alert(1)')).toBeNull()
  })
})

test('payment queue includes approved unpaid earnings without requiring a payment record', () => {
  const submission = { id: 'video', sprintId: 'campaign', status: 'approved', approvedAmountCents: 4500 } as AdminSubmission
  const data = { submissions: [submission], payments: [] } as unknown as AdminDashboard
  expect(approvedUnpaidSubmissions(data).map(item => item.id)).toEqual(['video'])
  data.payments = [{ submissionId: 'video', status: 'paid', amountCents: 1500 }] as AdminDashboard['payments']
  expect(approvedUnpaidSubmissions(data)).toHaveLength(1)
  data.payments.push({ submissionId: 'video', status: 'pending', amountCents: 3000 } as AdminDashboard['payments'][number])
  expect(approvedUnpaidSubmissions(data)).toHaveLength(1)
  data.payments[1].status = 'paid'
  expect(approvedUnpaidSubmissions(data)).toHaveLength(0)
  data.payments[1].status = 'failed'
  expect(approvedUnpaidSubmissions(data)).toHaveLength(1)
  submission.status = 'in_review'
  expect(approvedUnpaidSubmissions(data)).toHaveLength(0)
})
