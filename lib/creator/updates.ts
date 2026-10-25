export type SubmissionHistorySnapshot = {
  submittedViews: number | null
  submittedAudiencePercent: number | null
  verifiedViews: number | null
  verifiedAudiencePercent: number | null
  approvedAmountCents: number | null
  campaignId: string | null
  campaignName: string | null
}

import { submissionAge } from './submission-timeline'

import type { CreatorPayment, CreatorSubmission } from '@/components/creator/types'

export type CreatorUpdateType = 'submitted' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'paid' | 'rereview_requested' | 'feedback'
export type CreatorUpdate = {
  id: string
  submissionId: string
  type: CreatorUpdateType
  note: string | null
  createdAt: string
  title: string
  submissionIds?: string[]
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
  const payouts = new Map<string, CreatorUpdate & { submissionIds: string[] }>()
  for (const payment of payments) {
    const post = submissions.find(item => item.id === payment.submissionId)
    if (!post || payment.status !== 'paid' || !payment.paidAt) continue
    const id = payment.payoutRequestId ? `payout:${payment.payoutRequestId}` : `payment:${payment.id}`
    const payout = payouts.get(id)
    if (payout) {
      if (!payout.submissionIds.includes(post.id)) payout.submissionIds.push(post.id)
      if (Date.parse(payment.paidAt) > Date.parse(payout.createdAt)) payout.createdAt = payment.paidAt
      if (payout.submissionIds.length > 1) payout.title = `${payout.submissionIds.length} posts included in this payout`
    } else {
      payouts.set(id, { id, submissionId: post.id, submissionIds: [post.id], type: 'paid', note: null, createdAt: payment.paidAt, title: post.caption || post.title })
    }
  }
  activity.push(...payouts.values())
  const submittedBatches = new Map<string, CreatorUpdate & { submissionIds: string[] }>()
  const grouped = activity.filter(item => {
    if (item.type !== 'submitted') return true
    const batch = submittedBatches.get(item.createdAt)
    if (!batch) {
      submittedBatches.set(item.createdAt, { ...item, submissionIds: [...(item.submissionIds || [item.submissionId])] })
    } else if (!batch.submissionIds.includes(item.submissionId)) {
      batch.submissionIds.push(item.submissionId)
    }
    return false
  })
  grouped.push(...submittedBatches.values())
  return grouped.filter(item => Number.isFinite(Date.parse(item.createdAt))).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id)).slice(0, 20)
}


export function creatorUpdateAge(value: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}hr ago`
  return submissionAge(value, now).replace('M ago', 'mo ago').toLowerCase()
}
