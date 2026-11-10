import { creatorUnpaidCents, hasCreatorPayoutMethod } from '@/lib/creator/money'
import type { AdminCreator, AdminDashboard, AdminPayment, AdminSubmission, ReviewTarget } from '@/components/admin/creator-types'

export type ApprovalTarget = Exclude<ReviewTarget, { resource: 'payment' }>
export type ApprovalKind = 'submission' | 'account' | 'payout'
export type SubmissionReviewQueueId = 'general-looksmaxxing' | 'feature-comparison' | 'detailed-analysis' | 'other'

export const submissionReviewQueueLabels: Record<SubmissionReviewQueueId, string> = {
  'general-looksmaxxing': 'General Looksmaxxing',
  'feature-comparison': 'Face Feature Comparison',
  'detailed-analysis': 'Detailed Analysis',
  other: 'Other submissions',
}

export const approvalTypes = {
  submission: { label: 'Video submission', plural: 'Video submissions', color: 'border-violet-200 bg-violet-50 text-violet-700' },
  account: { label: 'Social account', plural: 'Social accounts', color: 'border-blue-200 bg-blue-50 text-blue-700' },
  payout: { label: 'Creator', plural: 'Creators', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
} as const

export function hasPayoutDestination(creator: AdminCreator) {
  return hasCreatorPayoutMethod(creator)
}

export function approvalKind(target: ApprovalTarget): ApprovalKind {
  return target.resource === 'creator' ? 'payout' : target.resource
}

export function approvalSubmittedAt(target: ApprovalTarget) {
  return target.resource === 'submission' && target.item.reviewRequestedAt
    ? target.item.reviewRequestedAt
    : target.item.createdAt
}

export function getApprovalQueue(data: AdminDashboard): ApprovalTarget[] {
  return [
    ...data.submissions.filter((item) => (item.status === 'pending' || item.status === 'in_review') && !(item.studioGenerationId && !item.analyticsScreenshotUrl)).map((item) => ({ resource: 'submission' as const, item })),
  ].sort((a, b) => {
    const aTime = Date.parse(approvalSubmittedAt(a))
    const bTime = Date.parse(approvalSubmittedAt(b))
    return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER)
  })
}

export function submissionReviewQueueId(submission: AdminSubmission): SubmissionReviewQueueId {
  const format = submission.sprintTerms?.formats.find(item => item.id === submission.formatId)
  const identity = [submission.formatId, format?.name, submission.sprintName, submission.title].filter(Boolean).join(' ').toLowerCase()
  if (identity.includes('general-looksmaxxing') || identity.includes('general looksmaxxing')) return 'general-looksmaxxing'
  if (identity.includes('feature-comparison') || identity.includes('face feature comparison')) return 'feature-comparison'
  if (identity.includes('detailed-analysis') || identity.includes('detailed analysis')) return 'detailed-analysis'
  return 'other'
}

export function getSubmissionReviewQueues(data: AdminDashboard) {
  const queues = new Map<SubmissionReviewQueueId, ApprovalTarget[]>([
    ['general-looksmaxxing', []],
    ['feature-comparison', []],
    ['detailed-analysis', []],
    ['other', []],
  ])
  for (const target of getApprovalQueue(data)) {
    const queueId = target.resource === 'submission' ? submissionReviewQueueId(target.item) : 'other'
    queues.get(queueId)!.push(target)
  }
  return [...queues].filter(([id, items]) => id !== 'other' || items.length).map(([id, items]) => ({ id, label: submissionReviewQueueLabels[id], items }))
}

export function isNewInLastDay(value: string, now = Date.now()) {
  const time = Date.parse(value)
  return time > now - 86_400_000 && time <= now
}

export function walletExplorerUrl(network: string | null, address: string | null) {
  if (!network || !address) return null
  const explorers: Record<string, string> = {
    base: 'https://basescan.org/address/',
    ethereum: 'https://etherscan.io/address/',
    'usdc on solana': 'https://solscan.io/account/',
    solana: 'https://solscan.io/account/',
  }
  const explorer = explorers[network.trim().toLowerCase()]
  return explorer ? explorer + encodeURIComponent(address) : null
}

export { publishedVideoEmbedUrl } from '@/lib/creator/post-embed'

export function approvedUnpaidSubmissions(data: Pick<AdminDashboard, 'submissions' | 'payments'>) {
  return data.submissions.filter(submission => submission.status === 'approved' && creatorUnpaidCents(submission, data.payments) > 0)
}

type OutstandingPaymentLine = { id: string; creatorProfileId: string; creatorName: string; title: string; submission?: AdminSubmission; payment?: AdminPayment; paidCents: number; processingCents: number; amountCents: number; kind: string; at: string; currency: string }

export function creatorOutstandingPaymentGroups(submissions: AdminDashboard['submissions'], payments: AdminDashboard['payments'], otherPayments: AdminDashboard['payments'] = []) {
  const lines: OutstandingPaymentLine[] = submissions.map(submission => {
    const records = payments.filter(payment => payment.submissionId === submission.id)
    const paidCents = records.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amountCents, 0)
    const outstandingCents = creatorUnpaidCents(submission, records)
    const processingCents = Math.min(outstandingCents, records.filter(payment => payment.status === 'processing').reduce((sum, payment) => sum + payment.amountCents, 0))
    return { id: submission.id, creatorProfileId: submission.creatorProfileId, creatorName: submission.creatorName, title: submission.title, submission, payment: undefined, paidCents, processingCents, amountCents: outstandingCents - processingCents, kind: paidCents > 0 ? 'Rereview' : 'New submission', at: submission.updatedAt || submission.createdAt, currency: 'USD' }
  })
  const includedIds = new Set(submissions.map(submission => submission.id))
  for (const payment of otherPayments) {
    if (!['pending', 'processing'].includes(payment.status) || payment.payoutRequestId || (payment.submissionId && includedIds.has(payment.submissionId))) continue
    const paidCents = payment.submissionId ? payments.filter(item => item.submissionId === payment.submissionId && item.status === 'paid').reduce((sum, item) => sum + item.amountCents, 0) : 0
    lines.push({ id: payment.id, creatorProfileId: payment.creatorProfileId, creatorName: payment.creatorName, title: payment.submissionTitle || 'Manual payment', payment, paidCents, processingCents: payment.status === 'processing' ? payment.amountCents : 0, amountCents: payment.status === 'processing' ? 0 : payment.amountCents, kind: payment.bonusSprintId ? 'Bonus' : payment.submissionId ? paidCents > 0 ? 'Rereview' : 'New submission' : 'Manual payment', at: payment.createdAt, currency: payment.currency })
  }
  type Line = typeof lines[number]
  const groups = new Map<string, { creatorProfileId: string; creatorName: string; currency: string; amountCents: number; processingCents: number; lines: Line[] }>()
  lines.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  for (const line of lines) {
    if (line.amountCents + line.processingCents <= 0) continue
    const key = `${line.creatorProfileId}:${line.currency}`
    let group = groups.get(key)
    if (!group) { group = { creatorProfileId: line.creatorProfileId, creatorName: line.creatorName, currency: line.currency, amountCents: 0, processingCents: 0, lines: [] }; groups.set(key, group) }
    group.amountCents += line.amountCents
    group.processingCents += line.processingCents
    group.lines.push(line)
  }
  return [...groups.values()]
}
