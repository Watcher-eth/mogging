import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import { CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { submissionRejectionLabel, type CreatorSubmissionReviewItem, type CreatorSubmissionReviewResult } from '@/lib/creator/submission-review'

type ReviewItem = CreatorSubmissionReviewItem & CreatorSubmissionReviewResult

export function SubmissionReviewFeedback({ items, status, note }: { items: ReviewItem[]; status: string; note?: string | null }) {
  const rejected = status === 'rejected'
  const failed = items.filter(item => !item.met)
  const met = items.filter(item => item.met)
  return <section aria-label={rejected ? 'Why this was rejected' : 'Requirements review'} className={cn('mt-5 rounded-2xl border p-4 sm:p-5', rejected ? 'border-red-200 bg-red-50/50' : 'border-zinc-200 bg-white')}>
    <div className="flex items-start gap-3">
      {rejected ? <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600"><XCircle aria-hidden="true" className="size-5" /></span> : null}
      <div><h3 className={cn('text-base font-semibold tracking-tight', rejected ? 'text-red-950' : 'text-zinc-900')}>{rejected ? 'Why this was rejected' : 'Requirements review'}</h3>
        <p className="mt-1 text-xs leading-5 text-zinc-600">{rejected ? failed.length ? `${failed.length} ${failed.length === 1 ? 'requirement needs' : 'requirements need'} attention. Read the reasons below before requesting another review.` : 'The team did not attach checklist reasons to this review. Ask for clarification in Messages.' : `${met.length} of ${items.length} requirements met.`}</p>
      </div>
    </div>
    {failed.length ? <ol className="mt-4 grid gap-2.5">{failed.map((item, index) => <li key={item.id} className="flex items-start gap-3 rounded-xl border border-red-100 bg-white p-3.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-50 text-xs font-semibold text-red-600">{index + 1}</span>
      <div className="min-w-0"><p className="text-sm font-semibold leading-5 text-zinc-900">{submissionRejectionLabel(item)}</p><p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600">{item.note || item.detail}</p></div>
    </li>)}</ol> : null}
    {note ? <div className="mt-4 rounded-xl bg-white p-3.5"><p className="text-xs font-semibold text-zinc-900">Team feedback</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600">{note}</p></div> : null}
    {rejected ? <p className="mt-4 text-xs leading-5 text-zinc-600">Need help understanding the review? Send the team a message below.</p> : null}
    {met.length && !rejected ? <Disclosure className="mt-4 border-t border-zinc-100 pt-3"><DisclosureSummary className="cursor-pointer text-xs font-medium text-zinc-600">{met.length} requirements met</DisclosureSummary><AccordionContent><ul className="mt-3 grid gap-2">{met.map(item => <li key={item.id} className="flex items-start gap-2 text-xs leading-5 text-zinc-600"><CheckCircle2 aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />{item.label}</li>)}</ul></AccordionContent></Disclosure> : null}
  </section>
}
