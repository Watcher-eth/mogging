import { creatorUnpaidCents } from '@/lib/creator/money'
import type { AdminCreator, AdminDashboard, AdminPayment, AdminSubmission, ReviewTarget } from '@/components/admin/creator-types'

export type ApprovalTarget = Exclude<ReviewTarget, { resource: 'payment' }>
export type ApprovalKind = 'submission' | 'account' | 'payout'

export const approvalTypes = {
  submission: { label: 'Video submission', plural: 'Video submissions', color: 'border-violet-200 bg-violet-50 text-violet-700' },
  account: { label: 'Social account', plural: 'Social accounts', color: 'border-blue-200 bg-blue-50 text-blue-700' },
  payout: { label: 'Payout account', plural: 'Payout accounts', color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
} as const

export function hasPayoutDestination(creator: AdminCreator) {
  return creator.paymentOption === 'paypal' ? Boolean(creator.paypalEmail) : Boolean(creator.cryptoNetwork && creator.cryptoWalletAddress)
}

export function approvalKind(target: ApprovalTarget): ApprovalKind {
  return target.resource === 'creator' ? 'payout' : target.resource
}

export function getApprovalQueue(data: AdminDashboard): ApprovalTarget[] {
  return [
    ...data.submissions.filter((item) => item.status === 'pending' || item.status === 'in_review').map((item) => ({ resource: 'submission' as const, item })),
    ...data.accounts.filter((item) => item.status === 'pending' && item.analyticsVideoUrl && item.analyticsConfirmedAt).map((item) => ({ resource: 'account' as const, item })),
    ...data.creators.filter((item) => item.authStatus === 'pending' && hasPayoutDestination(item)).map((item) => ({ resource: 'creator' as const, item })),
  ].sort((a, b) => Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt))
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

export function publishedVideoEmbedUrl(postUrl: string | null) {
  if (!postUrl) return null
  try {
    const url = new URL(postUrl)
    if (url.protocol !== 'https:') return null
    if (['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname)) {
      const id = url.pathname.match(/^\/@[\w.]+\/video\/(\d+)\/?$/)?.[1]
      return id ? `https://www.tiktok.com/player/v1/${id}` : null
    }
    if (['instagram.com', 'www.instagram.com'].includes(url.hostname)) {
      const path = url.pathname.match(/^\/(reel|reels|p)\/([\w-]+)\/?$/)
      return path ? `https://www.instagram.com/${path[1]}/${path[2]}/embed/` : null
    }
  } catch { return null }
  return null
}


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
    lines.push({ id: payment.id, creatorProfileId: payment.creatorProfileId, creatorName: payment.creatorName, title: payment.submissionTitle || 'Manual payment', payment, paidCents, processingCents: payment.status === 'processing' ? payment.amountCents : 0, amountCents: payment.status === 'processing' ? 0 : payment.amountCents, kind: payment.submissionId ? paidCents > 0 ? 'Rereview' : 'New submission' : 'Manual payment', at: payment.createdAt, currency: payment.currency })
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
