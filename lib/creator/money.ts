import { calculateCreatorPayout, isCreatorViewThreshold } from './payouts'
import type {
  CreatorPayment,
  CreatorProfile,
  CreatorSubmission,
} from '@/components/creator/types'
export function hasCreatorPayoutMethod(
  profile: CreatorProfile | null | undefined,
) {
  return Boolean(
    profile &&
    (profile.paymentOption === 'paypal'
      ? profile.paypalEmail
      : profile.cryptoNetwork && profile.cryptoWalletAddress),
  )
}
type EarningsSubmission = Pick<CreatorSubmission, 'id' | 'sprintId' | 'approvedAmountCents' | 'status' | 'adminViewCountThreshold' | 'adminUsAudiencePercent'>

export function creatorEarnedCents(submission: EarningsSubmission) {
  if (submission.sprintId) return submission.approvedAmountCents || 0
  if (submission.status !== 'approved' && submission.status !== 'paid') return 0
  const views = submission.adminViewCountThreshold
  return views !== null && isCreatorViewThreshold(views)
    ? calculateCreatorPayout(views, true, submission.adminUsAudiencePercent)
        .payout * 100
    : 0
}
export function creatorMoneySummary(
  submissions: CreatorSubmission[],
  payments: CreatorPayment[],
) {
  const cashouts = payments.filter((payment) => payment.status === 'paid')
  const earnings = submissions.filter(submission => creatorUnpaidCents(submission, payments) > 0)
  const balanceCents = earnings.reduce((sum, submission) => sum + creatorUnpaidCents(submission, payments), 0)
    + payments.filter(payment => !payment.submissionId && ['pending', 'processing'].includes(payment.status)).reduce((sum, payment) => sum + payment.amountCents, 0)
  return {
    cashouts,
    earnings,
    balanceCents,
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

// Existing pending transfers can join a bundle. Processing transfers and open
// bundles are already reserved and must never be requested a second time.
export function creatorBundlePlan(submissions: EarningsSubmission[], payments: Pick<CreatorPayment, 'id' | 'submissionId' | 'amountCents' | 'status' | 'payoutRequestId'>[]) {
  const lines: { submissionId: string | null; earnedCents: number; newCents: number; amountCents: number; pendingIds: string[] }[] = submissions.flatMap(submission => {
    const earnedCents = Math.round(creatorEarnedCents(submission))
    const records = payments.filter(payment => payment.submissionId === submission.id)
    const newCents = remainingCreatorPaymentCents(earnedCents, records)
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
