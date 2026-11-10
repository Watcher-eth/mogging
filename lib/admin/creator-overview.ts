import { creatorBundlePlan, creatorContentBalances, creatorUnpaidCents, hasCreatorPayoutMethod } from '@/lib/creator/money'
import type { AdminCreator, AdminDashboard, AdminPayment, AdminQueueSubmission, AdminSubmission, ReviewTarget } from '@/components/admin/creator-types'
import { payoutChain } from './crypto-payouts/shared'

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

type QueueTarget<T extends AdminQueueSubmission = AdminQueueSubmission> = { resource: 'submission'; item: T }

export function approvalSubmittedAt(target: ApprovalTarget | QueueTarget) {
  return target.resource === 'submission' && target.item.reviewRequestedAt
    ? target.item.reviewRequestedAt
    : target.item.createdAt
}

export function getApprovalQueue<T extends AdminQueueSubmission>(data: { submissions: T[] }): QueueTarget<T>[] {
  return data.submissions
    .filter(item => (item.status === 'pending' || item.status === 'in_review')
      && (!item.studioGenerationId || (item.hasAnalyticsRecording ?? Boolean(item.analyticsScreenshotUrl))))
    .map(item => ({ resource: 'submission' as const, item }))
    .sort((a, b) => {
      const aTime = Date.parse(approvalSubmittedAt(a))
      const bTime = Date.parse(approvalSubmittedAt(b))
      return (Number.isFinite(aTime) ? aTime : Number.MAX_SAFE_INTEGER) - (Number.isFinite(bTime) ? bTime : Number.MAX_SAFE_INTEGER)
    })
}

export function submissionReviewQueueId(submission: Pick<AdminQueueSubmission, 'sprintTerms' | 'formatId' | 'sprintName' | 'title' | 'formatName'>): SubmissionReviewQueueId {
  const format = submission.sprintTerms?.formats.find(item => item.id === submission.formatId)
  const identity = [submission.formatId, submission.formatName ?? format?.name, submission.sprintName, submission.title].filter(Boolean).join(' ').toLowerCase()
  if (identity.includes('general-looksmaxxing') || identity.includes('general looksmaxxing')) return 'general-looksmaxxing'
  if (identity.includes('feature-comparison') || identity.includes('face feature comparison')) return 'feature-comparison'
  if (identity.includes('detailed-analysis') || identity.includes('detailed analysis')) return 'detailed-analysis'
  return 'other'
}

export function getSubmissionReviewQueues<T extends AdminQueueSubmission>(data: { submissions: T[] }) {
  const queues = new Map<SubmissionReviewQueueId, QueueTarget<T>[]>([
    ['general-looksmaxxing', []],
    ['feature-comparison', []],
    ['detailed-analysis', []],
    ['other', []],
  ])
  for (const target of getApprovalQueue(data)) {
    const queueId = submissionReviewQueueId(target.item)
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

export function adminContentBalances(data: Pick<AdminDashboard, 'submissions' | 'payments'>) {
  const posts = new Map<string, AdminSubmission[]>()
  const payments = new Map<string, AdminPayment[]>()
  for (const submission of data.submissions) {
    const list = posts.get(submission.creatorProfileId) ?? []
    list.push(submission)
    posts.set(submission.creatorProfileId, list)
  }
  for (const payment of data.payments) {
    const list = payments.get(payment.creatorProfileId) ?? []
    list.push(payment)
    payments.set(payment.creatorProfileId, list)
  }
  const unpaid = new Map<string, number>()
  const debts = new Map<string, number>()
  for (const [creatorId, submissions] of posts) {
    const balance = creatorContentBalances(submissions, payments.get(creatorId) ?? [])
    for (const [id, amount] of balance.unpaid) unpaid.set(id, amount)
    if (balance.debtCents) debts.set(creatorId, balance.debtCents)
  }
  return { unpaid, debts }
}

export function approvedUnpaidSubmissions(data: Pick<AdminDashboard, 'submissions' | 'payments'>, balances = adminContentBalances(data).unpaid) {
  return data.submissions.filter(submission => submission.status === 'approved' && (balances.get(submission.id) ?? 0) > 0)
}

type OutstandingPaymentLine = { id: string; creatorProfileId: string; creatorName: string; title: string; submission?: AdminSubmission; payment?: AdminPayment; paidCents: number; processingCents: number; amountCents: number; kind: string; at: string; currency: string }

export function creatorOutstandingPaymentGroups(submissions: AdminDashboard['submissions'], payments: AdminDashboard['payments'], otherPayments: AdminDashboard['payments'] = [], balances?: Map<string, number>) {
  const lines: OutstandingPaymentLine[] = submissions.map(submission => {
    const records = payments.filter(payment => payment.submissionId === submission.id)
    const paidCents = records.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amountCents, 0)
    const outstandingCents = balances?.get(submission.id) ?? creatorUnpaidCents(submission, records)
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

export function creatorPaymentQueue(data: Pick<AdminDashboard, 'creators' | 'submissions' | 'payments' | 'payoutRequests'>) {
  const creators = new Map(data.creators.map(creator => [creator.id, creator]))
  const { unpaid: balances, debts } = adminContentBalances(data)
  const unpaid = approvedUnpaidSubmissions(data, balances).filter(submission => !creators.get(submission.creatorProfileId)?.bundledPayouts)
  const unpaidIds = new Set(unpaid.map(submission => submission.id))
  const held = data.creators.filter(creator => creator.bundledPayouts).map(creator => ({
    creator,
    plan: creatorBundlePlan(data.submissions.filter(submission => submission.creatorProfileId === creator.id), data.payments.filter(payment => payment.creatorProfileId === creator.id)),
  })).filter(({ plan }) => plan.amountCents > 0)

  const scheduledBySubmission = new Map<string, AdminPayment>()
  const requests = (data.payoutRequests ?? []).filter(request => request.status === 'pending')
  const requestIds = new Set(requests.map(request => request.id))
  const requestPayments = new Map<string, AdminPayment[]>()
  for (const payment of data.payments) {
    if (payment.payoutRequestId && requestIds.has(payment.payoutRequestId)) {
      const records = requestPayments.get(payment.payoutRequestId) ?? []
      records.push(payment)
      requestPayments.set(payment.payoutRequestId, records)
    }
    if (payment.submissionId && !scheduledBySubmission.has(payment.submissionId) && ['pending', 'processing'].includes(payment.status)) {
      scheduledBySubmission.set(payment.submissionId, payment)
    }
  }

  const heldIds = new Set(held.flatMap(({ plan }) => plan.lines.flatMap(line => line.pendingIds)))
  const active = (payment: AdminPayment) => payment.status === 'pending' || payment.status === 'processing'
  const standalone = data.payments.filter(payment => active(payment) && !payment.payoutRequestId &&
    !creators.get(payment.creatorProfileId)?.bundledPayouts && (!payment.submissionId || !unpaidIds.has(payment.submissionId)))
  const standaloneIds = new Set(standalone.map(payment => payment.id))
  const history = data.payments.filter(payment => !active(payment) || (
    !payment.payoutRequestId && !heldIds.has(payment.id) && !standaloneIds.has(payment.id) && !unpaidIds.has(payment.submissionId ?? '')
  ))
  const groups = creatorOutstandingPaymentGroups(unpaid, data.payments, standalone, balances)
  const lineMethod = (line: OutstandingPaymentLine) => line.payment?.paymentOption ??
    scheduledBySubmission.get(line.submission?.id ?? '')?.paymentOption ?? creators.get(line.creatorProfileId)?.paymentOption ?? 'paypal'
  const optionKey = (method: AdminPayment['paymentOption'], network?: string | null) =>
    method === 'crypto' ? payoutChain(network) ?? method : method

  const totals = new Map<string, Map<string, number>>()
  function addTotal(bucket: string, amount: number, currency: string) {
    if (amount <= 0) return
    const amounts = totals.get(bucket) ?? new Map<string, number>()
    amounts.set(currency, (amounts.get(currency) ?? 0) + amount)
    totals.set(bucket, amounts)
  }
  function addBalance(status: string, amount: number, currency: string) {
    addTotal(status, amount, currency)
    addTotal('outstanding', amount, currency)
  }
  function addReady(method: AdminPayment['paymentOption'], network: string | null | undefined, amount: number, currency: string) {
    addTotal(optionKey(method, network), amount, currency)
    addBalance('ready', amount, currency)
  }
  for (const group of groups) {
    for (const line of group.lines) {
      addReady(lineMethod(line), creators.get(line.creatorProfileId)?.cryptoNetwork, line.amountCents, line.currency)
    }
  }
  for (const request of requests) {
    const records = requestPayments.get(request.id) ?? []
    const paidCents = records.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amountCents, 0)
    const remainingCents = request.amountCents - paidCents
    if (records.some(payment => payment.status === 'processing')) {
      addBalance('processing', remainingCents, 'USD')
    } else {
      addReady(request.paymentOption, request.network, remainingCents, 'USD')
    }
  }
  for (const payment of data.payments) {
    if (payment.status !== 'processing' || (payment.payoutRequestId && requestIds.has(payment.payoutRequestId))) continue
    addBalance('processing', payment.amountCents, payment.currency)
  }
  for (const submission of data.submissions) {
    if (submission.status !== 'in_review' || !submission.reviewRequestedAt || creators.get(submission.creatorProfileId)?.bundledPayouts) continue
    const records = data.payments.filter(payment => payment.submissionId === submission.id)
    const reserved = records.filter(payment => ['pending', 'processing'].includes(payment.status)).reduce((sum, payment) => sum + payment.amountCents, 0)
    addBalance('review', Math.max(0, (balances.get(submission.id) ?? 0) - reserved), 'USD')
  }
  return { unpaid, held, history, groups, lineMethod, totals, balances, debts }
}
