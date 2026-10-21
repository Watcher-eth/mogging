import Link from 'next/link'
import { ArrowUpRight, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { submissionRejectionLabel, type CreatorSubmissionReviewItem, type CreatorSubmissionReviewResult } from '@/lib/creator/submission-review'

type ReviewItem = CreatorSubmissionReviewItem & CreatorSubmissionReviewResult

export function SubmissionRequirementsReview({ items, status, onChange }: {
  items: ReviewItem[]
  status: string
  onChange: (items: ReviewItem[]) => void
}) {
  const rejecting = status === 'rejected'
  const selectedCount = items.filter(item => rejecting ? !item.met : item.met).length
  function update(index: number, patch: Partial<CreatorSubmissionReviewResult>) {
    onChange(items.map((item, i) => i === index ? { ...item, ...patch } : item))
  }
  return <section className="mt-6" aria-label={rejecting ? 'Rejection reasons' : 'Creator-guide requirements'}>
    <div className="flex items-start justify-between gap-4">
      <div><h3 className="text-sm font-semibold">{rejecting ? 'Why are you rejecting this video?' : 'Creator-guide requirements'}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{rejecting ? 'Check only the requirements they did not meet. These reasons and your feedback will be shown to the creator.' : 'Check only the requirements they fulfilled. Unchecked items do not block approval and remain visible to the creator. Apply any payout penalty in Earnings.'}</p>
      </div>
      <span aria-live="polite" className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums', rejecting ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-600')}>{rejecting ? `${selectedCount} selected` : `${selectedCount}/${items.length}`}</span>
    </div>
    <Link href="/creator/guide#video-requirements" target="_blank" className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-zinc-600 underline decoration-zinc-300 underline-offset-4 hover:text-black">Open video requirements <ArrowUpRight className="size-3.5" /></Link>
    <div className="mt-3 grid gap-2">
      {items.map((item, index) => {
        const selected = rejecting ? !item.met : item.met
        return <div key={item.id} className={cn('rounded-2xl border p-3.5 transition-colors duration-150', rejecting && selected ? 'border-red-200 bg-red-50/60' : 'border-zinc-200 bg-white')}>
          <label className="flex min-h-6 cursor-pointer items-start gap-3">
            <input type="checkbox" className={cn('mt-0.5 size-4 shrink-0 rounded border-zinc-300', rejecting ? 'accent-red-600' : 'accent-emerald-600')} checked={selected} onChange={event => update(index, { met: rejecting ? !event.target.checked : event.target.checked, note: null })} />
            <span className={cn('text-sm font-medium leading-5', rejecting && selected ? 'text-red-950' : 'text-zinc-800')}>{rejecting ? submissionRejectionLabel(item) : item.label}</span>
          </label>
          {rejecting && selected ? <div className="ml-7 mt-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-red-700"><XCircle aria-hidden="true" className="size-3.5" />Shown to the creator</p>
            <textarea aria-label={`Feedback for ${item.label}`} value={item.note || ''} maxLength={500} onChange={event => update(index, { note: event.target.value })} className="mt-2 min-h-20 w-full resize-y rounded-xl border border-red-200 bg-white p-3 text-sm leading-5 outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100" placeholder="Add a specific example or explain how to fix this (optional)" />
          </div> : <details className="ml-7 mt-2"><summary className="cursor-pointer text-xs text-zinc-500">Requirement details</summary><p className="mt-2 text-xs leading-5 text-zinc-500">{item.detail}</p></details>}
        </div>
      })}
    </div>
  </section>
}
