import type { CreatorDashboard } from '@/components/creator/types'

export function creatorOverviewMetrics(data: CreatorDashboard) {
  const posts = data.submissions.filter(post => post.status !== 'rejected')
  const payments = data.payments.filter(payment => payment.currency === 'USD' && payment.status !== 'cancelled')
  const bonuses = payments.filter(payment => payment.bonusSprintId && payment.bonusKey)
  const total = (items: typeof payments) => items.reduce((sum, item) => sum + item.amountCents, 0)
  return {
    views: posts.reduce((sum, post) => sum + (post.adminViewCountThreshold ?? post.viewCountThreshold ?? 0), 0),
    posts: [...posts].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    paidCents: total(payments.filter(payment => payment.status === 'paid')),
    inReview: posts.filter(post => post.status === 'pending' || post.status === 'in_review').length,
    approved: posts.filter(post => post.status === 'approved' || post.status === 'paid').length,
    bonusCents: total(bonuses),
    bonusPaidCents: total(bonuses.filter(payment => payment.status === 'paid')),
    bonusOutstandingCents: total(bonuses.filter(payment => payment.status !== 'paid')),
  }
}
