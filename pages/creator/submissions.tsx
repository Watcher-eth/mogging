import { RegisteredPosts } from '@/components/creator/registered-posts'
import { SubmissionReviewFeedback } from '@/components/creator/submission-review-feedback'
import { CREATOR_REREVIEW_GUIDANCE } from '@/lib/creator/post-guidance'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { SubmissionDialog as AnalyticsSubmissionDialog } from '@/components/creator/submission-dialog'
import { SubmissionConversation } from '@/components/creator/submission-conversation'
import { SubmissionPostPreview, useSubmissionPostPreview } from '@/components/creator/submission-post-preview'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, Eye, MessageCircle, CircleAlert, Clock3, Loader2, RotateCcw, XCircle } from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { SubmissionReviewAnimation } from '@/components/creator/submission-review-animation'
import type { CreatorDashboard, CreatorPayment, CreatorSubmission } from '@/components/creator/types'
import type { CreatorPostPreview } from '@/lib/creator/post-preview'
import { apiGet } from '@/lib/api/client'
import { mergeCreatorSubmissionReviewResults, withAudienceRejectionReason } from '@/lib/creator/submission-review'
import { sprintReviewItems } from '@/lib/creator/sprints'
import { creatorEarnedCents } from '@/lib/creator/money'
import { cn } from '@/lib/utils'

const filters = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'rejected', label: 'Rejected' },
] as const

export default function CreatorSubmissionsPage() {
  return <CreatorShell><SubmissionsContent /></CreatorShell>
}

function SubmissionsContent() {
  const { data, isLoading, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet, { refreshInterval: 30_000 })
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [analyticsId, setAnalyticsId] = useState<string | null>(null)
  const analyticsSubmission = data?.submissions.find(item => item.id === analyticsId)
  const selected = data?.submissions.find(item => item.id === selectedId) || null
  const submissions = useMemo(() => data?.submissions || [], [data?.submissions])
  const visible = useMemo(() => filter === 'all' ? submissions : submissions.filter((item) => item.status === filter), [filter, submissions])
  const paymentBySubmission = useMemo(() => new Map((data?.payments || []).filter((payment) => payment.submissionId).map((payment) => [payment.submissionId, payment])), [data?.payments])
  const accountStatusById = useMemo(() => new Map((data?.socialAccounts || []).map((account) => [account.id, account.status])), [data?.socialAccounts])

  return (
    <>
      <CreatorHeader eyebrow="History & Payments" title="Submissions" description="Follow every video from review through approval and payout." action={<Button asChild className="h-11 rounded-full px-5"><Link href="/creator/submit">New Submission</Link></Button>} />
      {data ? <RegisteredPosts data={data} onChange={mutate} /> : null}
      <label className="mb-5 flex items-center gap-3 text-sm font-medium">Status<select className="creator-field max-w-xs" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>{filters.map((item) => <option key={item.value} value={item.value}>{item.label} ({item.value === 'all' ? submissions.length : submissions.filter((submission) => submission.status === item.value).length})</option>)}</select></label>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div> : visible.length ? <div className="grid gap-3">{visible.map((submission, index) => <SubmissionCard key={submission.id} submission={submission} payment={paymentBySubmission.get(submission.id)} onClick={() => setSelectedId(submission.id)} style={{ animationDelay: `${Math.min(index * 45, 180)}ms` }} />)}</div> : <EmptyState filtered={filter !== 'all'} />}
      <SubmissionDialog key={selected?.id || "closed"} submission={selected} payment={selected ? paymentBySubmission.get(selected.id) : undefined} payments={selected ? (data?.payments || []).filter(payment => payment.submissionId === selected.id) : []} linkedToApprovedAccount={Boolean(selected?.socialAccountId && accountStatusById.get(selected.socialAccountId) === 'approved')} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null) }} onUpdateAnalytics={() => { setAnalyticsId(selected!.id); setSelectedId(null) }} />
      {analyticsSubmission ? <AnalyticsSubmissionDialog key={analyticsSubmission.id} open existingSubmission={analyticsSubmission} onOpenChange={open => { if (!open) setAnalyticsId(null) }} onSubmitted={async () => { await mutate() }} /> : null}
    </>
  )
}

function SubmissionCard({ submission, payment, onClick, style }: { submission: CreatorSubmission; payment?: CreatorPayment; onClick: () => void; style: React.CSSProperties }) {
  const { ref, preview, visible } = useSubmissionPostPreview(submission)
  const amount = submission.sprintId && creatorEarnedCents(submission) > 0 ? formatMoney(creatorEarnedCents(submission), 'USD') : payment ? formatMoney(payment.amountCents, payment.currency) : submission.status === 'approved' ? formatMoney(creatorEarnedCents(submission), 'USD') : null
  const submittedViews = submission.reviewRequestedAt ? submission.viewCountThreshold : submission.adminViewCountThreshold ?? submission.viewCountThreshold
  const currentViews = preview?.viewCount ?? null
  const views = currentViews ?? submittedViews
  const caption = preview?.caption || submission.caption
  const viewsDescription = views === null ? 'No views recorded' : currentViews !== null
    ? `${views.toLocaleString('en-US')} public views${preview?.fetchedAt ? ` · checked ${new Date(preview.fetchedAt).toLocaleString('en-US')}` : ''}`
    : `${views.toLocaleString('en-US')} submitted views`
  let username = preview?.authorName?.replace(/^@/, '')
  if (!username && submission.postUrl) {
    try {
      const path = new URL(submission.postUrl).pathname
      username = path.match(/^\/@([^/]+)/)?.[1]
    } catch { /* Legacy submissions may not have a valid published URL. */ }
  }
  return (
    <button ref={ref} onClick={onClick} style={style} className="creator-list-item creator-surface group grid w-full grid-cols-[80px_minmax(0,1fr)] items-center gap-x-4 p-3 text-left transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-black/10 hover:shadow-[0_16px_40px_rgba(0,0,0,0.06)] active:scale-[0.99] sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-x-5 sm:p-4">
      <SubmissionPostPreview preview={preview} videoUrl={visible ? submission.videoUrl : null} platform={submission.platform} />
      <span className="min-w-0">
        {caption ? <span className="line-clamp-2 whitespace-pre-wrap break-words text-sm font-semibold leading-5 tracking-[-0.02em] sm:line-clamp-none" title={caption}>{caption}</span> : null}
        <span className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium tabular-nums text-zinc-700" title={viewsDescription}>
          <span className="inline-flex items-center gap-1.5"><Eye className="size-3.5 text-zinc-400" aria-hidden="true" />{views === null ? 'Views not recorded' : `${formatViewCount(views)} ${currentViews === null ? 'submitted views' : 'views'}`}</span>
          <span aria-hidden="true" className="px-0.5 text-zinc-300">·</span>
          <span className="whitespace-nowrap text-xs font-normal text-zinc-500">{formatDate(submission.createdAt)}</span>
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-2">
          {username ? <span className="break-all text-xs font-medium text-zinc-500">@{username}</span> : null}
          {amount ? <span className="text-sm font-semibold">{amount}</span> : null}
          {submission.unreadMessages ? <span aria-label={`${submission.unreadMessages} new messages`} className="inline-flex items-center gap-1 rounded-lg bg-[#007aff] px-2 py-1 text-[11px] font-semibold text-white"><MessageCircle className="size-3" aria-hidden="true" />{submission.unreadMessages}</span> : null}
          <StatusPill status={submission.status} />
        </span>
      </span>
    </button>
  )
}

function SubmissionDialog({ submission, payment, payments, linkedToApprovedAccount, open, onOpenChange, onUpdateAnalytics }: { submission: CreatorSubmission | null; payment?: CreatorPayment; payments: CreatorPayment[]; linkedToApprovedAccount: boolean; open: boolean; onOpenChange: (open: boolean) => void; onUpdateAnalytics: () => void }) {
  const [tab, setTab] = useState<'conversation' | 'details'>('conversation')
  const { data: post } = useSWR<CreatorPostPreview>(open && submission?.postUrl ? `/api/creator/submissions/${submission.id}/preview` : null, apiGet, { dedupingInterval: 300_000, revalidateOnFocus: false })
  const caption = post?.caption || submission?.caption
  const evidenceSize = submission?.analyticsSizeBytes || submission?.videoSizeBytes

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="creator-dialog max-h-[90vh] max-w-2xl overflow-y-auto !rounded-[32px] border-zinc-200 bg-white p-0">
        <AnimatedDialogPanel contentKey={tab}>
        {submission && tab === 'details' ? <SubmissionEvidence submission={submission} /> : null}
        {submission ? (
          <div className="p-5 sm:p-7">
            <DialogHeader className="text-left">
              <div className="flex items-center gap-2 pr-10"><StatusPill status={submission.status} /><span className="text-xs text-zinc-400">{formatDate(submission.createdAt)}</span></div>
              <div className="flex items-center justify-between gap-3 pt-2">
                <DialogTitle className="min-w-0 flex-1 break-words text-xl">{caption || `${submission.platform} submission`}</DialogTitle>
                {submission.sprintId && !submission.reviewRequestedAt && !payments.some(item => ['pending', 'processing'].includes(item.status)) && (['approved', 'paid', 'rejected'].includes(submission.status) || !submission.analyticsScreenshotUrl) ? <Button variant="outline" className="min-h-10 max-w-[60%] shrink-0 whitespace-normal rounded-full px-3 text-xs sm:text-sm" onClick={onUpdateAnalytics}><RotateCcw className="size-4 shrink-0" aria-hidden="true" />{submission.analyticsScreenshotUrl ? 'Request rereview' : 'Add analytics & update views'}</Button> : null}
              </div>
              <DialogDescription>{CREATOR_REREVIEW_GUIDANCE}</DialogDescription>
            </DialogHeader>
            {payments.some(item => ['pending', 'processing'].includes(item.status)) ? <p className="mt-3 text-xs text-zinc-500">You can request rereview once your scheduled payout has finished processing.</p> : null}
            {submission.reviewRequestedAt ? <p className="mt-3 text-xs text-zinc-500">Updated analytics are awaiting review. Prior payouts remain unchanged.</p> : null}
            {submission.status === 'rejected' ? <CreatorReviewChecklist submission={submission} /> : null}
            <div className="mt-4 flex gap-1 rounded-full bg-zinc-100 p-1" aria-label="Submission view">{(['conversation', 'details'] as const).map(value => <button key={value} aria-pressed={tab === value} className={cn('min-h-10 flex-1 rounded-full text-sm font-medium capitalize', tab === value ? 'bg-white shadow-sm' : 'text-zinc-500')} onClick={() => setTab(value)}>{value === 'conversation' ? <>Messages{submission.unreadMessages ? <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-lg bg-[#007aff] px-1.5 py-0.5 text-[10px] text-white">{submission.unreadMessages}</span> : null}</> : 'Details'}</button>)}</div>
            {tab === 'conversation' ? <SubmissionConversation submissionId={submission.id} viewerRole="creator" /> : <>
            {!linkedToApprovedAccount && !submission.sprintId ? <div className="mt-6 flex gap-3 rounded-2xl creator-warning px-4 py-3 text-sm leading-6"><CircleAlert className="mt-0.5 size-4 shrink-0 text-zinc-600" /><p><strong className="font-semibold">Account Not Approved.</strong> This video is not currently connected to an approved TikTok or Instagram account.</p></div> : null}
            <div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm">
              <Detail label="Review Status" value={statusLabel(submission.status)} />
              {!submission.sprintId ? <Detail label="Account Eligibility" value={linkedToApprovedAccount ? 'Approved account' : 'Not approved'} /> : null}
              <Detail label="Evidence" value={submission.analyticsContentType?.startsWith('video/') ? 'Second-device analytics recording' : submission.analyticsScreenshotUrl ? 'Analytics screenshot' : submission.videoUrl ? 'Legacy video' : 'Not provided'} />
              <Detail label="Evidence Size" value={evidenceSize ? formatBytes(evidenceSize) : 'Not recorded'} />
              <Detail label="View Count Threshold" value={submission.viewCountThreshold ? `${formatViewCount(submission.viewCountThreshold)} views` : 'Not recorded'} />
              <Detail label="Tier 1 Audience" value={submission.usAudiencePercent !== null ? `${submission.usAudiencePercent}%` : 'Not recorded'} />
              <Detail label="Total approved earnings" value={formatMoney(submission.approvedAmountCents || 0, 'USD')} />
              {payments.length ? payments.map(item => <Detail key={item.id} label={item.paidAt ? `Payment · ${formatDate(item.paidAt)}` : 'Payment'} value={`${formatMoney(item.amountCents, item.currency)} · ${item.status}`} />) : <Detail label="Payment" value="Not scheduled" />}
              <Detail label="Payment Method" value={payment ? (payment.paymentOption === 'paypal' ? 'PayPal' : 'Crypto') : '—'} />
            </div>
            {caption ? <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Caption</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{caption}</p></div> : null}
            {submission.status !== 'rejected' && submission.reviewChecklist?.length ? <CreatorReviewChecklist submission={submission} /> : null}
            {submission.postUrl ? <Button asChild variant="outline" className="mt-6 h-10 rounded-xl"><a href={submission.postUrl} target="_blank" rel="noreferrer">Open Published Post <ArrowUpRight /></a></Button> : null}
            </>}
          </div>
        ) : null}
        </AnimatedDialogPanel>
      </DialogContent>
    </Dialog>
  )
}

function CreatorReviewChecklist({ submission }: { submission: CreatorSubmission }) {
  const items = submission.sprintTerms
    ? sprintReviewItems(submission.sprintTerms, submission.formatId || '').map(item => ({ ...item, met: submission.reviewChecklist?.find(result => result.id === item.id)?.met || false, note: submission.reviewChecklist?.find(result => result.id === item.id)?.note || null }))
    : mergeCreatorSubmissionReviewResults(submission.formatId, submission.reviewChecklist)
  // Missing entries in historical checklists were never reviewed; do not invent failures.
  const storedIds = new Set(submission.reviewChecklist?.map(item => item.id) || [])
  return <SubmissionReviewFeedback items={withAudienceRejectionReason(items, submission.status, submission.reviewChecklist).filter(item => storedIds.has(item.id))} status={submission.status} note={submission.reviewNote} />
}

function SubmissionEvidence({ submission }: { submission: CreatorSubmission }) {
  if (submission.analyticsScreenshotUrl && submission.analyticsContentType?.startsWith('video/')) return <div className="aspect-video overflow-hidden rounded-t-[31px] bg-black"><video className="size-full object-contain" src={submission.analyticsScreenshotUrl} controls preload="metadata" /></div>
  if (submission.analyticsScreenshotUrl) {
    return <div role="img" aria-label="Submitted video analytics screenshot" className="aspect-video rounded-t-[31px] bg-zinc-950 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(submission.analyticsScreenshotUrl)})` }} />
  }
  if (submission.videoUrl) return <div className="aspect-video overflow-hidden rounded-t-[31px] bg-black"><video className="size-full object-contain" src={submission.videoUrl} controls preload="metadata" /></div>
  return <div className="grid aspect-video place-items-center rounded-t-[31px] bg-zinc-950 text-sm text-white/50">No Media Evidence</div>
}

function StatusPill({ status }: { status: CreatorSubmission['status'] }) { return <span className={cn('shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold', status === 'paid' && 'creator-tone-green text-[#29CE53]', status === 'approved' && 'creator-tone-blue text-[#00A8EF]', (status === 'pending' || status === 'in_review') && 'bg-[#f5f6f7] text-[#52565c]', status === 'rejected' && 'creator-tone-red text-[#F33232]')}>{statusLabel(status)}</span> }
function EmptyState({ filtered }: { filtered: boolean }) { return <div className="creator-surface grid min-h-72 place-items-center px-4 py-8 sm:px-8 text-center"><div className="w-full">{filtered ? <span className="mx-auto grid size-12 place-items-center rounded-[16px] bg-[#f7f8f9] text-[#00A8EF]"><Clock3 className="size-5" /></span> : <SubmissionReviewAnimation />}<h2 className="mt-4 text-sm font-semibold">{filtered ? 'Nothing in This Status' : 'No Submissions Yet'}</h2><p className="mt-0.5 text-sm text-[#73777d]">{filtered ? 'Choose another filter to see more videos.' : 'Your submitted videos and payments will appear here.'}</p>{!filtered ? <Button asChild className="mt-6 h-10 rounded-full px-4"><Link href="/creator/submit">Submit Your First Video</Link></Button> : null}</div></div> }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">{label}</span><span className="text-right font-medium capitalize">{value}</span></div> }
function statusLabel(status: CreatorSubmission['status']) { return status === 'in_review' ? 'In Review' : status.slice(0, 1).toUpperCase() + status.slice(1) }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatBytes(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatViewCount(views: number) { return new Intl.NumberFormat('en-US', { notation: views >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(views) }
