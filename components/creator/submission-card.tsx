import { CalendarDays, Eye, MessageCircle, Sparkles } from 'lucide-react'
import { SubmissionPostPreview, useSubmissionPostPreview } from './submission-post-preview'
import type { CreatorPayment, CreatorSubmission } from './types'
import { bonusPaymentTotal, type BonusPayment } from '@/lib/creator/bonus-payments'
import { creatorEarnedCents } from '@/lib/creator/money'
import { submissionAge } from '@/lib/creator/submission-timeline'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function SubmissionCard({ submission, payment, accountHandle, onClick, bonuses, className }: { className?: string; bonuses: BonusPayment[]; submission: CreatorSubmission; payment?: CreatorPayment; accountHandle?: string | null; onClick: () => void }) {
  const { ref, preview, visible } = useSubmissionPostPreview(submission)
  const bonusCents = bonusPaymentTotal(bonuses)
  const baseAmount = submission.sprintId && creatorEarnedCents(submission) > 0 ? formatMoney(creatorEarnedCents(submission), 'USD') : payment ? formatMoney(payment.amountCents, payment.currency) : submission.status === 'approved' ? formatMoney(creatorEarnedCents(submission), 'USD') : null
  const amount = bonusCents ? formatMoney(creatorEarnedCents(submission) + bonusCents, 'USD') : baseAmount
  const submittedViews = submission.reviewRequestedAt ? submission.viewCountThreshold : submission.adminViewCountThreshold ?? submission.viewCountThreshold
  const recordedViewsLabel = !submission.reviewRequestedAt && submission.adminViewCountThreshold != null ? 'verified views' : 'submitted views'
  const currentViews = preview?.viewCount ?? null
  const views = currentViews ?? submittedViews
  const caption = preview?.caption || submission.caption
  const viewsDescription = views === null ? 'No views recorded' : currentViews !== null
    ? `${views.toLocaleString('en-US')} public views${preview?.fetchedAt ? ` · checked ${new Date(preview.fetchedAt).toLocaleString('en-US')}` : ''}`
    : `${views.toLocaleString('en-US')} ${recordedViewsLabel}`
  let username = preview?.authorName?.replace(/^@/, '')
  if (!username && submission.postUrl) {
    try {
      const path = new URL(submission.postUrl).pathname
      username = path.match(/^\/@([^/]+)/)?.[1]
    } catch { /* Legacy submissions may not have a valid published URL. */ }
  }
  username ||= accountHandle?.replace(/^@/, '')
  const statusDate = submission.status === 'paid' && payment?.paidAt ? { label: 'Paid', date: payment.paidAt }
    : submission.status === 'pending' ? { label: 'Submitted', date: submission.createdAt }
    : submission.status === 'in_review' && submission.reviewRequestedAt ? { label: 'Review requested', date: submission.reviewRequestedAt }
    : submission.updatedAt ? { label: 'Last updated', date: submission.updatedAt } : null
  return (
    <button ref={ref} onClick={onClick} className={cn("creator-list-item creator-surface group relative grid w-full grid-cols-[80px_minmax(0,1fr)] items-center gap-x-3 p-2.5 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] active:scale-[0.99] sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-x-4 sm:p-3", className)}>
      <SubmissionPostPreview preview={preview} videoUrl={visible ? submission.videoUrl : null} platform={submission.platform} />
      <span className="min-w-0 pt-5">
        <span className="absolute right-2.5 top-2.5 flex sm:right-3 sm:top-3"><StatusStamp status={submission.status} event={statusDate} /></span>
        {caption ? <span className="line-clamp-2 whitespace-pre-wrap break-words text-sm font-semibold leading-5 tracking-[-0.02em] sm:line-clamp-none" title={caption}>{caption}</span> : null}
        <span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium tabular-nums text-zinc-700" title={viewsDescription}>
          <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5 text-zinc-400" aria-hidden="true" />{views === null ? 'Views not recorded' : `${formatViewCount(views)} ${currentViews === null ? recordedViewsLabel : 'views'}`}</span>
          {username ? <><span aria-hidden="true" className="px-0.5 text-zinc-300">·</span><span className="min-w-0 truncate text-xs font-normal text-zinc-500">@{username}</span></> : null}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {amount ? <span className="text-sm font-semibold">{amount}</span> : null}
          {bonusCents > 0 ? <span className="inline-flex items-center gap-1 rounded-md border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"><Sparkles aria-hidden="true" className="size-3" />+{formatMoney(bonusCents, 'USD')} bonus</span> : null}
          {submission.unreadMessages ? <span aria-label={`${submission.unreadMessages} new messages`} className="inline-flex items-center gap-1 rounded-lg bg-[#007aff] px-2 py-1 text-[11px] font-semibold text-white"><MessageCircle className="size-3" aria-hidden="true" />{submission.unreadMessages}</span> : null}
          <time dateTime={submission.createdAt} title={`Uploaded ${new Date(submission.createdAt).toLocaleString('en-GB')}`} className="rounded-md bg-zinc-100/80 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-zinc-400">{submissionAge(submission.createdAt)}</time>
        </span>
      </span>
    </button>
  )
}


export function StatusStamp({ status, event }: { status: CreatorSubmission['status']; event?: { label: string; date: string } | null }) {
  const stamp = <span className={cn('inline-flex shrink-0 -rotate-2 items-center rounded-[3px] border border-current px-1.5 py-0.5 text-[9px] font-bold uppercase leading-3 tracking-[0.06em]', status === 'paid' && 'creator-tone-green text-[#29CE53]', status === 'approved' && 'creator-tone-blue text-[#00A8EF]', (status === 'pending' || status === 'in_review') && 'bg-[#f5f6f7] text-[#52565c]', status === 'rejected' && 'creator-tone-red text-[#F33232]')}>{statusLabel(status)}</span>
  if (!event) return stamp
  const date = new Date(event.date).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return <Tooltip>
    <TooltipTrigger asChild><span tabIndex={0} className="inline-flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-zinc-400" aria-label={`${statusLabel(status)} · ${event.label} ${date}`}>{stamp}</span></TooltipTrigger>
    <TooltipContent side="top" className="flex items-center gap-2 rounded-[12px_12px_12px_3px] border border-zinc-200 bg-white px-2.5 py-2 text-[11px] text-zinc-500 shadow-sm"><CalendarDays className="size-3.5" aria-hidden="true" /><span>{event.label} · {date}</span></TooltipContent>
  </Tooltip>
}

function statusLabel(status: CreatorSubmission['status']) { return status === 'in_review' ? 'In Review' : status.slice(0, 1).toUpperCase() + status.slice(1) }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) }
function formatViewCount(views: number) { return new Intl.NumberFormat('en-US', { notation: views >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(views) }
