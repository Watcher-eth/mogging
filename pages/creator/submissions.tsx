import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, CheckCircle2, CircleAlert, CircleDollarSign, Clock3, FileVideo, Loader2, XCircle } from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import type { CreatorDashboard, CreatorPayment, CreatorSubmission } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'
import { mergeCreatorSubmissionReviewResults } from '@/lib/creator/submission-review'
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
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet, { refreshInterval: 30_000 })
  const [filter, setFilter] = useState<(typeof filters)[number]['value']>('all')
  const [selected, setSelected] = useState<CreatorSubmission | null>(null)
  const submissions = useMemo(() => data?.submissions || [], [data?.submissions])
  const visible = useMemo(() => filter === 'all' ? submissions : submissions.filter((item) => item.status === filter), [filter, submissions])
  const paymentBySubmission = useMemo(() => new Map((data?.payments || []).filter((payment) => payment.submissionId).map((payment) => [payment.submissionId, payment])), [data?.payments])
  const accountStatusById = useMemo(() => new Map((data?.socialAccounts || []).map((account) => [account.id, account.status])), [data?.socialAccounts])

  return (
    <>
      <CreatorHeader eyebrow="History & Payments" title="Submissions" description="Follow every video from review through approval and payout." action={<Button asChild className="h-10 rounded-xl"><Link href="/creator/submit">New Submission</Link></Button>} />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5">
        {filters.map((item) => {
          const count = item.value === 'all' ? submissions.length : submissions.filter((submission) => submission.status === item.value).length
          return <button key={item.value} onClick={() => setFilter(item.value)} className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]', filter === item.value && 'bg-black text-white')}><span>{item.label}</span><span className={cn('text-[10px]', filter === item.value ? 'text-white/60' : 'text-zinc-400')}>{count}</span></button>
        })}
      </div>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div> : visible.length ? <div className="grid gap-3">{visible.map((submission, index) => <SubmissionCard key={submission.id} submission={submission} payment={paymentBySubmission.get(submission.id)} linkedToApprovedAccount={Boolean(submission.socialAccountId && accountStatusById.get(submission.socialAccountId) === 'approved')} onClick={() => setSelected(submission)} style={{ animationDelay: `${Math.min(index * 45, 180)}ms` }} />)}</div> : <EmptyState filtered={filter !== 'all'} />}
      <SubmissionDialog submission={selected} payment={selected ? paymentBySubmission.get(selected.id) : undefined} linkedToApprovedAccount={Boolean(selected?.socialAccountId && accountStatusById.get(selected.socialAccountId) === 'approved')} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }} />
    </>
  )
}

function SubmissionCard({ submission, payment, linkedToApprovedAccount, onClick, style }: { submission: CreatorSubmission; payment?: CreatorPayment; linkedToApprovedAccount: boolean; onClick: () => void; style: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={style} className="creator-list-item group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_40px_rgba(15,23,42,0.07)] active:scale-[0.995]">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><FileVideo className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-[-0.02em]">{submission.title}</span><span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500"><span>{submission.platform}</span><span>·</span><span>{formatDate(submission.createdAt)}</span>{!linkedToApprovedAccount ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700"><CircleAlert className="size-3" />Account Not Approved</span> : null}</span></span>
      <span className="hidden text-right sm:block">{payment ? <><span className="block text-sm font-semibold">{formatMoney(payment.amountCents, payment.currency)}</span><span className="mt-1 block text-xs capitalize text-zinc-500">{payment.status}</span></> : <span className="text-xs text-zinc-400">No Payment Yet</span>}</span>
      <StatusPill status={submission.status} />
      <ArrowUpRight className="size-4 shrink-0 text-zinc-300 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black" />
    </button>
  )
}

function SubmissionDialog({ submission, payment, linkedToApprovedAccount, open, onOpenChange }: { submission: CreatorSubmission | null; payment?: CreatorPayment; linkedToApprovedAccount: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const evidenceSize = submission?.analyticsSizeBytes || submission?.videoSizeBytes

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[28px] border-zinc-200 bg-white p-0">
        {submission ? <SubmissionEvidence submission={submission} /> : null}
        {submission ? (
          <div className="p-5 sm:p-7">
            <DialogHeader>
              <div className="flex items-center gap-2"><StatusPill status={submission.status} /><span className="text-xs text-zinc-400">{formatDate(submission.createdAt)}</span></div>
              <DialogTitle className="pt-2 text-2xl">{submission.title}</DialogTitle>
              <DialogDescription>{submission.platform}</DialogDescription>
            </DialogHeader>
            {!linkedToApprovedAccount ? <div className="mt-6 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"><CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" /><p><strong className="font-semibold">Account Not Approved.</strong> This video is not currently connected to an approved TikTok or Instagram account.</p></div> : null}
            <div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm">
              <Detail label="Review Status" value={statusLabel(submission.status)} />
              <Detail label="Account Eligibility" value={linkedToApprovedAccount ? 'Approved account' : 'Not approved'} />
              <Detail label="Evidence" value={submission.analyticsScreenshotUrl ? 'Analytics screenshot' : submission.videoUrl ? 'Legacy video' : 'Not provided'} />
              <Detail label="Evidence Size" value={evidenceSize ? formatBytes(evidenceSize) : 'Not recorded'} />
              <Detail label="View Count Threshold" value={submission.viewCountThreshold ? `${formatViewCount(submission.viewCountThreshold)} views` : 'Not recorded'} />
              <Detail label="U.S. Audience" value={submission.usAudiencePercent !== null ? `${submission.usAudiencePercent}%` : 'Default 20% Tier 1 Audience'} />
              <Detail label="Payment" value={payment ? `${formatMoney(payment.amountCents, payment.currency)} · ${payment.status}` : 'Not scheduled'} />
              <Detail label="Payment Method" value={payment ? (payment.paymentOption === 'paypal' ? 'PayPal' : 'Crypto') : '—'} />
            </div>
            {submission.caption ? <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Caption</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{submission.caption}</p></div> : null}
            {submission.reviewChecklist?.length ? <CreatorReviewChecklist submission={submission} /> : null}
            {submission.reviewNote ? <div className="mt-6 rounded-2xl border border-zinc-200 p-4"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Team Note</p><p className="mt-2 text-sm leading-6 text-zinc-600">{submission.reviewNote}</p></div> : null}
            {submission.postUrl ? <Button asChild variant="outline" className="mt-6 h-10 rounded-xl"><a href={submission.postUrl} target="_blank" rel="noreferrer">Open Published Post <ArrowUpRight /></a></Button> : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function CreatorReviewChecklist({ submission }: { submission: CreatorSubmission }) {
  const items = mergeCreatorSubmissionReviewResults(submission.formatId, submission.reviewChecklist)
  const metCount = items.filter((item) => item.met).length
  return <section className="mt-6 rounded-2xl border border-zinc-200 p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Requirements review</p><p className="mt-2 text-sm font-semibold">Creator-guide results</p><p className="mt-1 text-xs leading-5 text-zinc-500">See what your video satisfied and where the review team found a gap.</p></div><span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-zinc-600">{metCount}/{items.length}</span></div><div className="mt-4 grid gap-2">{items.map((item) => <div key={item.id} className={cn('flex items-start gap-3 rounded-xl p-3', item.met ? 'bg-emerald-50 text-emerald-950' : 'bg-red-50 text-red-950')}>{item.met ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" />}<div><p className="text-sm font-semibold">{item.label}</p><p className={cn('mt-1 text-[11px] leading-5', item.met ? 'text-emerald-800' : 'text-red-800')}>{item.note || (item.met ? 'Requirement satisfied.' : 'This requirement was not marked as satisfied.')}</p></div></div>)}</div></section>
}

function SubmissionEvidence({ submission }: { submission: CreatorSubmission }) {
  if (submission.analyticsScreenshotUrl) {
    return <div role="img" aria-label="Submitted video analytics screenshot" className="aspect-video rounded-t-[27px] bg-zinc-950 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${JSON.stringify(submission.analyticsScreenshotUrl)})` }} />
  }
  if (submission.videoUrl) return <div className="aspect-video overflow-hidden rounded-t-[27px] bg-black"><video className="size-full object-contain" src={submission.videoUrl} controls preload="metadata" /></div>
  return <div className="grid aspect-video place-items-center rounded-t-[27px] bg-zinc-950 text-sm text-white/50">No Media Evidence</div>
}

function StatusPill({ status }: { status: CreatorSubmission['status'] }) { return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', status === 'paid' && 'bg-emerald-50 text-emerald-700', status === 'approved' && 'bg-blue-50 text-blue-700', (status === 'pending' || status === 'in_review') && 'bg-amber-50 text-amber-700', status === 'rejected' && 'bg-red-50 text-red-700')}>{statusLabel(status)}</span> }
function EmptyState({ filtered }: { filtered: boolean }) { return <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-zinc-300 bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100">{filtered ? <Clock3 className="size-5" /> : <CircleDollarSign className="size-5" />}</span><h2 className="mt-4 text-sm font-semibold">{filtered ? 'Nothing in This Status' : 'No Submissions Yet'}</h2><p className="mt-2 text-sm text-zinc-500">{filtered ? 'Choose another filter to see more videos.' : 'Your submitted videos and payments will appear here.'}</p>{!filtered ? <Button asChild className="mt-6 h-10 rounded-xl"><Link href="/creator/submit">Submit Your First Video</Link></Button> : null}</div></div> }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">{label}</span><span className="text-right font-medium capitalize">{value}</span></div> }
function statusLabel(status: CreatorSubmission['status']) { return status === 'in_review' ? 'In Review' : status.slice(0, 1).toUpperCase() + status.slice(1) }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatBytes(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
function formatViewCount(views: number) { return views === 1_000_000 ? '+1M' : new Intl.NumberFormat('en-US', { notation: views >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 0 }).format(views) }
