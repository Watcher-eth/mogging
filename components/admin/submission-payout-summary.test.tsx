import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AdminPayment } from './creator-types'
import { SubmissionPayoutSummary } from './submission-payout-summary'

function payment(id: string, amountCents: number, status: AdminPayment['status']): AdminPayment {
  return { id, amountCents, status, currency: 'USD', paymentOption: 'paypal', paidAt: '2026-10-14T12:00:00Z', createdAt: '2026-10-14T12:00:00Z', providerReference: id, hasReceipt: status === 'paid', creatorProfileId: 'creator', creatorName: 'Creator', creatorEmail: 'creator@example.com', submissionId: 'submission', submissionTitle: 'Video' }
}

test('rereview shows the new milestone minus actual settled payouts and links their receipts', () => {
  const html = renderToStaticMarkup(<SubmissionPayoutSummary totalCents={4500} payments={[payment('first', 2275, 'paid')]} />)
  expect(html).toContain('Milestone total</dt><dd class="font-medium">$45.00')
  expect(html).toContain('Already paid</dt><dd class="font-medium">$22.75')
  expect(html).toContain('Additional to pay</dt><dd class="text-xl font-semibold tracking-tight">$22.25')
  expect(html).toContain('/api/admin/creator/payments/first/receipt')
})

test('scheduled payouts are reserved separately and failed or cancelled payouts do not reduce the difference', () => {
  const html = renderToStaticMarkup(<SubmissionPayoutSummary totalCents={6000} payments={[
    payment('first', 1000, 'paid'), payment('second', 1250, 'paid'),
    payment('pending', 500, 'pending'), payment('processing', 750, 'processing'),
    payment('failed', 6000, 'failed'), payment('cancelled', 6000, 'cancelled'),
  ]} />)
  expect(html).toContain('Already paid</dt><dd class="font-medium">$22.50')
  expect(html).toContain('Already scheduled</dt><dd class="font-medium">$12.50')
  expect(html).toContain('Additional to pay</dt><dd class="text-xl font-semibold tracking-tight">$25.00')
  expect(html).toContain('Paid history (2)')
  expect(html).not.toContain('/payments/failed/receipt')
})

test('paid history remains visible without an estimate and a lower milestone never creates a negative payout', () => {
  const payments = [payment('settled', 2275, 'paid')]
  const missing = renderToStaticMarkup(<SubmissionPayoutSummary totalCents={null} payments={payments} />)
  expect(missing).toContain('Already paid</dt><dd class="font-medium">$22.75')
  expect(missing).toContain('Additional to pay</dt><dd class="text-xl font-semibold tracking-tight">—')
  const lower = renderToStaticMarkup(<SubmissionPayoutSummary totalCents={2250} payments={payments} />)
  expect(lower).toContain('Additional to pay</dt><dd class="text-xl font-semibold tracking-tight">$0.00')
})
