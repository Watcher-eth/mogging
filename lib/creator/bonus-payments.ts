import { campaignBonusTargets, AUDIENCE_BONUS_MAX_CLAIMS, type ApprovedBonusPost, type BonusTarget } from './campaign-bonuses'
import { hasLaunchCampaignBonuses } from './campaign-launch'
import type { CreatorPayment } from '@/components/creator/types'

export type BonusPayment = Pick<CreatorPayment, 'id' | 'bonusSprintId' | 'bonusKey' | 'bonusNote' | 'amountCents' | 'currency' | 'status' | 'payoutRequestId'>

function awarded(payment: BonusPayment) {
  return Boolean(payment.bonusSprintId && payment.bonusKey && payment.currency === 'USD' && payment.status !== 'cancelled')
}

export function submissionBonusPayments<T extends BonusPayment>(submission: { id: string; sprintId?: string | null }, payments: readonly T[]) {
  return payments.filter(payment => awarded(payment) && ['audience', 'exclusivity', 'conversion'].some(kind => payment.bonusKey?.startsWith(`${kind}:${submission.id}:`)))
}

// Post IDs keep an award attached to its post even after a campaign transfer.
// Campaign-wide milestones remain scoped to their original campaign.
export function bonusTargetPayments<T extends BonusPayment>(payments: readonly T[], subject: string, sprintId: string) {
  const perPost = /^(audience|exclusivity|conversion):/.test(subject)
  return payments.filter(payment => (perPost || payment.bonusSprintId === sprintId) && payment.bonusKey?.startsWith(`${subject}:`))
}

export function campaignBonusPayments(payments: readonly BonusPayment[]) {
  return payments.filter(payment => awarded(payment) && /^(million|decimillion):\d+$/.test(payment.bonusKey!))
}

export function bonusPaymentTotal(payments: readonly BonusPayment[]) {
  return payments.reduce((sum, payment) => sum + payment.amountCents, 0)
}

export function bonusPaymentStatus(payment: BonusPayment) {
  if (payment.status === 'paid') return 'Paid'
  if (payment.status === 'failed') return 'Payment needs attention'
  if (payment.payoutRequestId || payment.status === 'processing') return 'Included in payout'
  return 'Added to balance'
}

// Preview the same automatic award used by reconciliation, without creating or
// changing ledger entries while the admin edits verified metrics.
export function reviewAudienceBonuses(
  post: ApprovedBonusPost & { creatorProfileId: string; status: string; sprintId?: string | null; sprintTerms?: import('./sprints').SprintTerms | null },
  payments: readonly (BonusPayment & { creatorProfileId: string })[],
): BonusTarget[] {
  if (!hasLaunchCampaignBonuses(post) || post.status === 'rejected' || (post.approvedAmountCents ?? 0) <= 0) return []
  const creatorPayments = payments.filter(payment => payment.creatorProfileId === post.creatorProfileId)
  // Existing awards (including deliberate cancellations) are never recreated.
  if (creatorPayments.some(payment => payment.bonusKey?.startsWith(`audience:${post.id}:`))) return []
  if (creatorPayments.filter(payment => payment.bonusKey?.startsWith('audience:') && payment.status !== 'cancelled').length >= AUDIENCE_BONUS_MAX_CLAIMS) return []
  const committed = payments.filter(payment => payment.bonusSprintId === post.sprintId && payment.status !== 'cancelled').reduce((sum, payment) => sum + payment.amountCents, 0)
  return campaignBonusTargets([post], false, new Map()).filter(target => target.subject === `audience:${post.id}` && target.cents <= (post.sprintTerms?.bonusBudgetCents ?? 0) - committed)
}
