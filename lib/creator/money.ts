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
  if (submission.status !== 'approved' && submission.status !== 'paid') return 0
  if (submission.sprintId) return submission.approvedAmountCents || 0
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
  const paidIds = new Set(cashouts.map((payment) => payment.submissionId))
  const earnings = submissions.filter(
    (submission) =>
      submission.status === 'approved' && !paidIds.has(submission.id),
  )
  const balanceCents = earnings.reduce(
    (sum, submission) => sum + creatorEarnedCents(submission),
    0,
  )
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
