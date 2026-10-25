import { expect, test } from 'bun:test'
import { canReceiveCreatorPayout, creatorBundlePlan, creatorMoneySummary, remainingCreatorPaymentCents } from './money'
import type { CreatorPayment, CreatorSubmission } from '@/components/creator/types'
test('a second milestone leaves only its increase unpaid', () => {
  const submission = {id:'s', sprintId:'campaign', status:'approved',approvedAmountCents:3000} as CreatorSubmission
  const payments = [{submissionId:'s',amountCents:1000,status:'paid'}] as CreatorPayment[]
  expect(creatorMoneySummary([submission],payments)).toMatchObject({balanceCents:2000,totalPaidCents:1000})
  expect(remainingCreatorPaymentCents(3000,payments)).toBe(2000)
})
test('rereview or rejection retains the original approved balance and paid history', () => {
  for (const status of ['in_review','rejected'] as const) {
    const submission = {id:'s',sprintId:'campaign',status,approvedAmountCents:1000} as CreatorSubmission
    expect(creatorMoneySummary([submission],[]).balanceCents).toBe(1000)
    expect(creatorMoneySummary([submission],[{submissionId:'s',amountCents:1000,status:'paid'}] as CreatorPayment[]).balanceCents).toBe(0)
  }
})
test('all prior payments are deducted, failed and cancelled attempts are excluded', () => {
  expect(remainingCreatorPaymentCents(3000,[{status:'paid',amountCents:1000},{status:'paid',amountCents:1000},{status:'processing',amountCents:500},{status:'failed',amountCents:1000},{status:'cancelled',amountCents:1000}])).toBe(500)
})

test('a legacy adjustment drives the balance and bundle instead of recalculating its payout', () => {
  const submission = { id: 's', status: 'approved', approvedAmountCents: 2000, adminViewCountThreshold: 40000, adminUsAudiencePercent: 30 } as CreatorSubmission
  expect(creatorMoneySummary([submission], []).balanceCents).toBe(2000)
  expect(creatorBundlePlan([submission], []).amountCents).toBe(2000)
  expect(creatorMoneySummary([{ ...submission, approvedAmountCents: 0 }], []).balanceCents).toBe(0)
  expect(creatorMoneySummary([{ ...submission, approvedAmountCents: null }], []).balanceCents).toBe(3200)
})


test('saved payout details are ready without manual approval, while suspension and missing destinations block payouts', () => {
  const paypal = { authStatus: 'pending' as const, paymentOption: 'paypal' as const, paypalEmail: 'creator@example.com', cryptoNetwork: null, cryptoWalletAddress: null }
  expect(canReceiveCreatorPayout(paypal)).toBe(true)
  expect(canReceiveCreatorPayout({ ...paypal, authStatus: 'verified' })).toBe(true)
  expect(canReceiveCreatorPayout({ ...paypal, authStatus: 'suspended' })).toBe(false)
  expect(canReceiveCreatorPayout({ ...paypal, paypalEmail: null })).toBe(false)
  const crypto = { ...paypal, paymentOption: 'crypto' as const, paypalEmail: null, cryptoNetwork: 'usdc on solana', cryptoWalletAddress: 'saved-wallet' }
  expect(canReceiveCreatorPayout(crypto)).toBe(true)
  expect(canReceiveCreatorPayout({ ...crypto, cryptoNetwork: null })).toBe(false)
  expect(canReceiveCreatorPayout({ ...crypto, cryptoWalletAddress: null })).toBe(false)
  expect(canReceiveCreatorPayout(null)).toBe(false)
})
