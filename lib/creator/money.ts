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
export function creatorEarnedCents(submission: CreatorSubmission) {
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

export function creatorUnpaidCents(submission: CreatorSubmission, payments: CreatorPayment[]) {
  return remainingCreatorPaymentCents(creatorEarnedCents(submission), payments.filter(payment => payment.submissionId === submission.id), false)
}
