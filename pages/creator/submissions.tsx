import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ArrowUpRight, CircleDollarSign, Clock3, FileVideo, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import type { CreatorDashboard, CreatorPayment, CreatorSubmission } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const filters = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_review', label: 'In review' },
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

  return (
    <>
      <CreatorHeader eyebrow="History & payments" title="Submissions" description="Follow every video from review through approval and payout." action={<Button asChild className="h-10 rounded-xl"><Link href="/creator/submit">New submission</Link></Button>} />
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5">
        {filters.map((item) => {
          const count = item.value === 'all' ? submissions.length : submissions.filter((submission) => submission.status === item.value).length
          return <button key={item.value} onClick={() => setFilter(item.value)} className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98]', filter === item.value && 'bg-black text-white')}><span>{item.label}</span><span className={cn('text-[10px]', filter === item.value ? 'text-white/60' : 'text-zinc-400')}>{count}</span></button>
        })}
      </div>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div> : visible.length ? <div className="grid gap-3">{visible.map((submission, index) => <SubmissionCard key={submission.id} submission={submission} payment={paymentBySubmission.get(submission.id)} onClick={() => setSelected(submission)} style={{ animationDelay: `${Math.min(index * 45, 180)}ms` }} />)}</div> : <EmptyState filtered={filter !== 'all'} />}
      <SubmissionDialog submission={selected} payment={selected ? paymentBySubmission.get(selected.id) : undefined} open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }} />
    </>
  )
}

function SubmissionCard({ submission, payment, onClick, style }: { submission: CreatorSubmission; payment?: CreatorPayment; onClick: () => void; style: React.CSSProperties }) {
  return (
    <button onClick={onClick} style={style} className="creator-list-item group flex w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-4 text-left shadow-[0_8px_30px_rgba(15,23,42,0.035)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_40px_rgba(15,23,42,0.07)] active:scale-[0.995]">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><FileVideo className="size-5" /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold tracking-[-0.02em]">{submission.title}</span><span className="mt-1 flex items-center gap-2 text-xs text-zinc-500"><span>{submission.platform}</span><span>·</span><span>{formatDate(submission.createdAt)}</span></span></span>
      <span className="hidden text-right sm:block">{payment ? <><span className="block text-sm font-semibold">{formatMoney(payment.amountCents, payment.currency)}</span><span className="mt-1 block text-xs capitalize text-zinc-500">{payment.status}</span></> : <span className="text-xs text-zinc-400">No payment yet</span>}</span>
      <StatusPill status={submission.status} />
      <ArrowUpRight className="size-4 shrink-0 text-zinc-300 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black" />
    </button>
  )
}

function SubmissionDialog({ submission, payment, open, onOpenChange }: { submission: CreatorSubmission | null; payment?: CreatorPayment; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto rounded-[28px] border-zinc-200 bg-white p-0"><div className="aspect-video overflow-hidden rounded-t-[27px] bg-black">{submission ? <video className="size-full object-contain" src={submission.videoUrl} controls preload="metadata" /> : null}</div>{submission ? <div className="p-5 sm:p-7"><DialogHeader><div className="flex items-center gap-2"><StatusPill status={submission.status} /><span className="text-xs text-zinc-400">{formatDate(submission.createdAt)}</span></div><DialogTitle className="pt-2 text-2xl">{submission.title}</DialogTitle><DialogDescription>{submission.platform}</DialogDescription></DialogHeader><div className="mt-6 grid gap-3 rounded-2xl bg-zinc-50 p-4 text-sm"><Detail label="Review status" value={statusLabel(submission.status)} /><Detail label="Payment" value={payment ? `${formatMoney(payment.amountCents, payment.currency)} · ${payment.status}` : 'Not scheduled'} /><Detail label="Payment method" value={payment ? (payment.paymentOption === 'paypal' ? 'PayPal' : 'Crypto') : '—'} /><Detail label="File size" value={formatBytes(submission.videoSizeBytes)} /></div>{submission.caption ? <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Caption</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-600">{submission.caption}</p></div> : null}{submission.reviewNote ? <div className="mt-6 rounded-2xl border border-zinc-200 p-4"><p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-400">Team note</p><p className="mt-2 text-sm leading-6 text-zinc-600">{submission.reviewNote}</p></div> : null}{submission.postUrl ? <Button asChild variant="outline" className="mt-6 h-10 rounded-xl"><a href={submission.postUrl} target="_blank" rel="noreferrer">Open published post <ArrowUpRight /></a></Button> : null}</div> : null}</DialogContent></Dialog>
}

function StatusPill({ status }: { status: CreatorSubmission['status'] }) { return <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', status === 'paid' && 'bg-emerald-50 text-emerald-700', status === 'approved' && 'bg-blue-50 text-blue-700', (status === 'pending' || status === 'in_review') && 'bg-amber-50 text-amber-700', status === 'rejected' && 'bg-red-50 text-red-700')}>{statusLabel(status)}</span> }
function EmptyState({ filtered }: { filtered: boolean }) { return <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-zinc-300 bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100">{filtered ? <Clock3 className="size-5" /> : <CircleDollarSign className="size-5" />}</span><h2 className="mt-4 text-sm font-semibold">{filtered ? 'Nothing in this status' : 'No submissions yet'}</h2><p className="mt-2 text-sm text-zinc-500">{filtered ? 'Choose another filter to see more videos.' : 'Your submitted videos and payments will appear here.'}</p>{!filtered ? <Button asChild className="mt-6 h-10 rounded-xl"><Link href="/creator/submit">Submit your first video</Link></Button> : null}</div></div> }
function Detail({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><span className="text-zinc-500">{label}</span><span className="text-right font-medium capitalize">{value}</span></div> }
function statusLabel(status: CreatorSubmission['status']) { return status === 'in_review' ? 'In review' : status.slice(0, 1).toUpperCase() + status.slice(1) }
function formatMoney(cents: number, currency: string) { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100) }
function formatDate(value: string) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) }
function formatBytes(bytes: number) { return `${(bytes / 1024 / 1024).toFixed(1)} MB` }
