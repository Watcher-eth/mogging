import type { CreatorPayment, CreatorSubmission } from '@/components/creator/types'

export type CreatorUpdateType = 'submitted' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'paid' | 'rereview_requested' | 'feedback'
export type CreatorUpdate = {
  id: string
  submissionId: string
  type: CreatorUpdateType
  note: string | null
  createdAt: string
  title: string
  snapshot?: boolean
}

export const creatorUpdateLabels: Record<CreatorUpdateType, string> = {
  submitted: 'Post submitted',
  pending: 'Post awaiting review',
  in_review: 'Your post is in review',
  approved: 'Your post was approved',
  rejected: 'Your post needs changes',
  paid: 'Payout sent',
  rereview_requested: 'Additional review requested',
  feedback: 'New review feedback',
}

// Review dates come from durable events. For older posts, show their known
// submission date; do not invent past approval or rejection timestamps.
export function creatorActivity(updates: CreatorUpdate[], submissions: CreatorSubmission[], payments: CreatorPayment[]) {
  const submitted = new Set(updates.filter(item => item.type === 'submitted').map(item => item.submissionId))
  const existingRequests = new Set(updates.filter(item => item.type === 'rereview_requested').map(item => `${item.submissionId}:${item.createdAt}`))
  const activity: CreatorUpdate[] = [...updates]
  for (const post of submissions) {
    if (!submitted.has(post.id)) activity.push({ id: `submitted:${post.id}`, submissionId: post.id, type: 'submitted', note: null, createdAt: post.createdAt, title: post.caption || post.title })
    if (['in_review', 'approved', 'rejected'].includes(post.status) && !post.reviewRequestedAt && !updates.some(item => item.submissionId === post.id)) activity.push({ id: `status:${post.id}`, submissionId: post.id, type: post.status, note: post.reviewNote, createdAt: post.updatedAt || post.createdAt, title: post.caption || post.title, snapshot: true })
    if (post.reviewRequestedAt && !existingRequests.has(`${post.id}:${post.reviewRequestedAt}`)) activity.push({ id: `rereview:${post.id}`, submissionId: post.id, type: 'rereview_requested', note: null, createdAt: post.reviewRequestedAt, title: post.caption || post.title })
  }
  for (const payment of payments) {
    const post = submissions.find(item => item.id === payment.submissionId)
    if (post && payment.status === 'paid' && payment.paidAt) activity.push({ id: `payment:${payment.id}`, submissionId: post.id, type: 'paid', note: null, createdAt: payment.paidAt, title: post.caption || post.title })
  }
  return activity.filter(item => Number.isFinite(Date.parse(item.createdAt))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 20)
}
