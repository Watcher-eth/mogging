import { calculateCreatorPayout, isCreatorViewThreshold } from './payouts'
import type {
  CreatorPayment,
  CreatorProfile,
  CreatorSubmission,
} from '@/components/creator/types'
type PayoutDetails = Pick<CreatorProfile, 'paymentOption' | 'paypalEmail' | 'cryptoNetwork' | 'cryptoWalletAddress' | 'bankTransferDetails'>

export function creatorPaymentLabel(option: CreatorProfile['paymentOption']) {
  return { paypal: 'PayPal', crypto: 'Crypto', bank_transfer: 'Bank transfer' }[option]
}

export function creatorPayoutDestination(profile: PayoutDetails) {
  return (profile.paymentOption === 'paypal' ? profile.paypalEmail : profile.paymentOption === 'crypto' ? profile.cryptoWalletAddress : profile.bankTransferDetails)?.trim() || null
}

export function hasCreatorPayoutMethod(
  profile: PayoutDetails | null | undefined,
) {
  return Boolean(
    profile &&
    creatorPayoutDestination(profile) &&
    (profile.paymentOption !== 'crypto' || profile.cryptoNetwork?.trim()) &&
    (profile.paymentOption !== 'bank_transfer' || profile.bankTransferDetails!.trim().length >= 20),
  )
}
// Saving valid payout details makes a creator ready; suspension is a separate gate.
export function canReceiveCreatorPayout(profile: (PayoutDetails & Pick<CreatorProfile, 'authStatus'>) | null | undefined) {
  return Boolean(profile && profile.authStatus !== 'suspended' && hasCreatorPayoutMethod(profile))
}

type EarningsSubmission = Pick<CreatorSubmission, 'id' | 'sprintId' | 'approvedAmountCents' | 'status' | 'adminViewCountThreshold' | 'adminUsAudiencePercent' | 'campaignPayoutCorrected'> & { createdAt?: string | Date }

export function creatorEarnedCents(submission: EarningsSubmission) {
  if (submission.sprintId) return submission.approvedAmountCents || 0
  if (submission.status !== 'approved' && submission.status !== 'paid') return 0
  if (submission.approvedAmountCents != null) return submission.approvedAmountCents
  const views = submission.adminViewCountThreshold
  return views !== null && isCreatorViewThreshold(views)
    ? calculateCreatorPayout(views, true, submission.adminUsAudiencePercent)
        .payout * 100
    : 0
}
type BalancePayment = Pick<CreatorPayment, 'submissionId' | 'amountCents' | 'status'> & { currency?: string }

// Work in cents. Real cash transfers stay in the ledger. Unpaid content absorbs
// a correction before more cash becomes available; bonuses and manual payouts are separate.
export function creatorContentBalances(submissions: EarningsSubmission[], payments: BalancePayment[]) {
  const totals = new Map<string, { paid: number; pending: number; processing: number; foreign: boolean }>()
  for (const payment of payments) {
    if (!payment.submissionId || !['paid', 'pending', 'processing'].includes(payment.status)) continue
    const row = totals.get(payment.submissionId) ?? { paid: 0, pending: 0, processing: 0, foreign: false }
    if (payment.status === 'paid' || payment.status === 'pending' || payment.status === 'processing') row[payment.status] += payment.amountCents
    row.foreign ||= Boolean(payment.currency && payment.currency !== 'USD')
    totals.set(payment.submissionId, row)
  }
  const unpaid = new Map<string, number>()
  let overpaymentCents = 0
  const ordered = [...submissions].sort((a, b) => (+new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0)) || a.id.localeCompare(b.id))
  for (const post of ordered) {
    const amounts = totals.get(post.id)
    const raw = Math.round(creatorEarnedCents(post)) - (amounts?.paid ?? 0)
    unpaid.set(post.id, Math.max(0, raw))
    if (post.campaignPayoutCorrected && !amounts?.foreign) overpaymentCents += Math.max(0, -raw)
  }
  let debtCents = overpaymentCents
  for (const reservePending of [true, false]) {
    for (const post of ordered) {
      if (!debtCents) break
      const amounts = totals.get(post.id)
      if (amounts?.foreign) continue
      const due = unpaid.get(post.id) ?? 0
      const protectedCents = (amounts?.processing ?? 0) + (reservePending ? amounts?.pending ?? 0 : 0)
      const offset = Math.min(debtCents, Math.max(0, due - protectedCents))
      unpaid.set(post.id, due - offset)
      debtCents -= offset
    }
  }
  return { unpaid, debtCents, overpaymentCents }
}

export function creatorMoneySummary<T extends EarningsSubmission>(
  submissions: T[],
  payments: CreatorPayment[],
) {
  const cashouts = payments.filter((payment) => payment.status === 'paid')
  const { unpaid, debtCents, overpaymentCents } = creatorContentBalances(submissions, payments)
  const earnings = submissions.filter(submission => (unpaid.get(submission.id) ?? 0) > 0)
  const balanceCents = earnings.reduce((sum, submission) => sum + (unpaid.get(submission.id) ?? 0), 0) - debtCents
    + payments.filter(payment => !payment.submissionId && ['pending', 'processing'].includes(payment.status)).reduce((sum, payment) => sum + payment.amountCents, 0)
  return {
    cashouts,
    earnings,
    balanceCents,
    unpaid,
    debtCents,
    overpaymentCents,
    bonusEarnings: payments.filter(payment => (payment.bonusSprintId || payment.creatorReferralAwardId) && payment.status !== 'paid' && payment.status !== 'cancelled'),
    totalPaidCents: cashouts.reduce(
      (sum, payment) => sum + payment.amountCents,
      0,
    ),
    pendingReview: submissions.filter(
      (submission) =>
        submission.status === 'pending' || submission.status === 'in_review',
    ).length,
  }
}

export function remainingCreatorPaymentCents(totalCents: number, payments: Pick<CreatorPayment, 'amountCents' | 'status'>[], includeScheduled = true) {
  const committed = payments.filter(payment => payment.status === 'paid' || (includeScheduled && ['pending', 'processing'].includes(payment.status))).reduce((sum, payment) => sum + payment.amountCents, 0)
  return Math.max(0, totalCents - committed)
}

export function creatorUnpaidCents(submission: EarningsSubmission, payments: Pick<CreatorPayment, 'submissionId' | 'amountCents' | 'status'>[]) {
  return remainingCreatorPaymentCents(creatorEarnedCents(submission), payments.filter(payment => payment.submissionId === submission.id), false)
}

export function creatorSubmissionAwaitingPayout(submission: EarningsSubmission, payments: Pick<CreatorPayment, 'submissionId' | 'amountCents' | 'status'>[]) {
  return ['approved', 'paid'].includes(submission.status) && creatorUnpaidCents(submission, payments) > 0
}

export function creatorMissingPaymentData(profile: PayoutDetails | null | undefined, submissions: EarningsSubmission[], payments: Pick<CreatorPayment, 'submissionId' | 'amountCents' | 'status'>[]) {
  if (!profile || hasCreatorPayoutMethod(profile)) return false
  const { unpaid } = creatorContentBalances(submissions, payments)
  return submissions.some(post => ['approved', 'paid'].includes(post.status) && (unpaid.get(post.id) ?? 0) > 0)
}

export function canUseCreatorBankTransfer(profile: PayoutDetails | null | undefined, submissions: EarningsSubmission[], payments: Pick<CreatorPayment, 'submissionId' | 'amountCents' | 'status'>[]) {
  return profile?.paymentOption === 'bank_transfer' || creatorMissingPaymentData(profile, submissions, payments)
}

// Existing pending transfers can join a bundle. Processing transfers and open
// bundles are already reserved and must never be requested a second time.
export function creatorBundlePlan(submissions: EarningsSubmission[], payments: (BalancePayment & Pick<CreatorPayment, 'id' | 'payoutRequestId'>)[]) {
  const { unpaid } = creatorContentBalances(submissions, payments)
  const lines: { submissionId: string | null; earnedCents: number; newCents: number; amountCents: number; pendingIds: string[] }[] = submissions.flatMap(submission => {
    const earnedCents = Math.round(creatorEarnedCents(submission))
    const records = payments.filter(payment => payment.submissionId === submission.id)
    const reservedCents = records.filter(payment => payment.status === 'pending' || payment.status === 'processing').reduce((sum, payment) => sum + payment.amountCents, 0)
    const newCents = Math.max(0, (unpaid.get(submission.id) ?? 0) - reservedCents)
    const pending = records.filter(payment => payment.status === 'pending' && !payment.payoutRequestId)
    const scheduledCents = pending.reduce((sum, payment) => sum + payment.amountCents, 0)
    const amountCents = newCents + scheduledCents
    return amountCents > 0 ? [{ submissionId: submission.id, earnedCents, newCents, amountCents, pendingIds: pending.map(payment => payment.id) }] : []
  })
  const manual = payments.filter(payment => !payment.submissionId && payment.status === 'pending' && !payment.payoutRequestId)
  const manualCents = manual.reduce((sum, payment) => sum + payment.amountCents, 0)
  if (manualCents > 0) lines.push({ submissionId: null, earnedCents: manualCents, newCents: 0, amountCents: manualCents, pendingIds: manual.map(payment => payment.id) })
  return { lines, amountCents: lines.reduce((sum, line) => sum + line.amountCents, 0) }
}
