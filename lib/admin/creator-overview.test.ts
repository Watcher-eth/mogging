import { describe, expect, test } from 'bun:test'
import type { AdminAccount, AdminCreator, AdminDashboard, AdminPayment, AdminSubmission } from '@/components/admin/creator-types'
import { approvedUnpaidSubmissions, creatorOutstandingPaymentGroups, approvalKind, getApprovalQueue, getSubmissionReviewQueues, isNewInLastDay, publishedVideoEmbedUrl, walletExplorerUrl } from './creator-overview'

describe('admin overview approvals', () => {
  test('queues every submission without retired account or payout approval steps', () => {
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
    expect(queue).toHaveLength(10)
    expect(queue[0].item.id).toBe('0')
    expect(queue.at(-1)?.item.id).toBe('9')
    expect(queue.map(approvalKind)).not.toContain('account')
    expect(queue.map(approvalKind)).not.toContain('payout')
    expect(queue.some((target) => target.item.id === 'registration')).toBe(false)
    expect(queue.some((target) => target.item.id === 'incomplete')).toBe(false)
  })

  test('orders oldest review submissions first and uses the rereview request time', () => {
    const data = {
      submissions: [
        { id: 'new-submission', status: 'pending', createdAt: '2026-10-03T12:00:00Z' },
        { id: 'rereview', status: 'in_review', createdAt: '2026-09-01T12:00:00Z', reviewRequestedAt: '2026-10-02T12:00:00Z' },
        { id: 'first-submission', status: 'pending', createdAt: '2026-10-01T12:00:00Z' },
      ] as AdminSubmission[],
      accounts: [],
      creators: [],
    } as unknown as AdminDashboard

    expect(getApprovalQueue(data).map(target => target.item.id)).toEqual([
      'first-submission',
      'rereview',
      'new-submission',
    ])
  })

  test('separates campaign formats into first-come-first-served queues', () => {
    const data = {
      submissions: [
        { id: 'general-new', status: 'pending', formatId: 'launch-general-looksmaxxing-v1', createdAt: '2026-10-04T12:00:00Z' },
        { id: 'comparison', status: 'pending', formatId: 'launch-feature-comparison-v1', createdAt: '2026-10-02T12:00:00Z' },
        { id: 'general-first', status: 'pending', formatId: 'launch-general-looksmaxxing-v1', createdAt: '2026-10-01T12:00:00Z' },
        { id: 'analysis-rereview', status: 'in_review', formatId: 'legacy', sprintName: 'Mogging Detailed Analysis', createdAt: '2026-09-01T12:00:00Z', reviewRequestedAt: '2026-10-03T12:00:00Z' },
      ] as AdminSubmission[],
      accounts: [],
      creators: [],
    } as unknown as AdminDashboard

    const queues = getSubmissionReviewQueues(data)
    expect(queues.map(queue => [queue.label, queue.items.map(target => target.item.id)])).toEqual([
      ['General Looksmaxxing', ['general-first', 'general-new']],
      ['Face Feature Comparison', ['comparison']],
      ['Detailed Analysis', ['analysis-rereview']],
    ])
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

test('outstanding creator groups deduct paid milestones and do not duplicate scheduled payments', () => {
  const submissions = [
    {id:'rereview',creatorProfileId:'a',creatorName:'Same name',title:'Milestone',sprintId:'campaign',approvedAmountCents:3500,status:'approved',createdAt:'2026-10-15',updatedAt:'2026-10-17'},
    {id:'new',creatorProfileId:'a',creatorName:'Same name',title:'New video',sprintId:'campaign',approvedAmountCents:1500,status:'approved',createdAt:'2026-10-16'},
    {id:'other',creatorProfileId:'b',creatorName:'Same name',title:'Other creator',sprintId:'campaign',approvedAmountCents:1000,status:'approved',createdAt:'2026-10-14'},
  ] as AdminSubmission[]
  const payments = [
    {id:'paid',submissionId:'rereview',creatorProfileId:'a',status:'paid',amountCents:1500,currency:'USD'},
    {id:'pending',submissionId:'rereview',creatorProfileId:'a',status:'pending',amountCents:2000,currency:'USD'},
    {id:'failed',submissionId:'new',creatorProfileId:'a',status:'failed',amountCents:1500,currency:'USD'},
  ] as AdminPayment[]
  const groups = creatorOutstandingPaymentGroups(submissions,payments,[payments[1]])
  expect(groups).toHaveLength(2)
  expect(groups[0]).toMatchObject({creatorProfileId:'a',amountCents:3500,processingCents:0})
  expect(groups[0].lines.map(line=>[line.id,line.kind,line.amountCents])).toEqual([['rereview','Rereview',2000],['new','New submission',1500]])
  expect(groups[1]).toMatchObject({creatorProfileId:'b',amountCents:1000})
})

test('processing transfers and different currencies are never included in the amount to send again', () => {
  const submission = {id:'s',creatorProfileId:'a',creatorName:'Creator',title:'Video',sprintId:'campaign',approvedAmountCents:3000,status:'approved',createdAt:'2026-10-16'} as AdminSubmission
  const payments = [
    {id:'paid',submissionId:'s',creatorProfileId:'a',status:'paid',amountCents:1000,currency:'USD'},
    {id:'processing',submissionId:'s',creatorProfileId:'a',status:'processing',amountCents:500,currency:'USD'},
    {id:'manual',submissionId:null,creatorProfileId:'a',creatorName:'Creator',status:'pending',amountCents:700,currency:'EUR',createdAt:'2026-10-17'},
    {id:'bundle',submissionId:null,creatorProfileId:'a',creatorName:'Creator',status:'pending',amountCents:900,currency:'USD',payoutRequestId:'request',createdAt:'2026-10-17'},
  ] as AdminPayment[]
  const groups = creatorOutstandingPaymentGroups([submission],payments,payments)
  expect(groups).toHaveLength(2)
  expect(groups.find(group=>group.currency==='USD')).toMatchObject({amountCents:1500,processingCents:500})
  expect(groups.find(group=>group.currency==='EUR')).toMatchObject({amountCents:700,processingCents:0})
  expect(groups.flatMap(group=>group.lines).some(line=>line.id==='bundle')).toBe(false)
})
