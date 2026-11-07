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

type EarningsSubmission = Pick<CreatorSubmission, 'id' | 'sprintId' | 'approvedAmountCents' | 'status' | 'adminViewCountThreshold' | 'adminUsAudiencePercent'>

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
  return Boolean(profile && !hasCreatorPayoutMethod(profile) && submissions.some(submission => creatorSubmissionAwaitingPayout(submission, payments)))
}

export function canUseCreatorBankTransfer(profile: PayoutDetails | null | undefined, submissions: EarningsSubmission[], payments: Pick<CreatorPayment, 'submissionId' | 'amountCents' | 'status'>[]) {
  return profile?.paymentOption === 'bank_transfer' || creatorMissingPaymentData(profile, submissions, payments)
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
