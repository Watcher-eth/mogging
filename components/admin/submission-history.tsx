import useSWR from 'swr'
import { CalendarDays,Check,Clock3,RotateCcw,Wallet } from 'lucide-react'
import { apiGet } from '@/lib/api/client'
import type { SubmissionHistoryEntry } from '@/lib/admin/submission-history'

export type SubmissionHistoryData={ entries: SubmissionHistoryEntry[]; hasLegacyEvents: boolean }
const money=(cents: number,currency='USD') => new Intl.NumberFormat('en-US',{ style: 'currency',currency }).format(cents/100)
const timestamp=(at: string) => new Intl.DateTimeFormat('en-US',{ month: 'short',day: 'numeric',year: 'numeric',hour: 'numeric',minute: '2-digit',timeZoneName: 'short' }).format(new Date(at))

export function SubmissionHistory({ submissionId,active }: { submissionId: string; active: boolean }) {
  const { data,error,isLoading,mutate }=useSWR<SubmissionHistoryData>(active? `/api/admin/creator/submissions/${encodeURIComponent(submissionId)}/history`:null,apiGet,{ revalidateOnFocus: false })
  if(error) return <div role="alert" className="rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-600">Couldn’t load this post’s history.<button type="button" onClick={() => void mutate()} className="ml-2 text-zinc-950 underline underline-offset-4">Try again</button></div>
  if(isLoading||!data) return <p role="status" className="py-8 text-center text-sm text-zinc-400">Loading history…</p>
  return <SubmissionHistoryTimeline {...data} />
}

export function SubmissionHistoryTimeline({ entries,hasLegacyEvents }: SubmissionHistoryData) {
  return <section aria-label="Post history">
    <div className="mb-6"><h3 className="text-base font-semibold">Post history</h3><p className="mt-1 text-xs leading-5 text-zinc-500">Submission, review, and payment events, from first to latest.{hasLegacyEvents? ' Some older events have no saved metrics or earnings snapshot.':''}</p></div>
    <ol className="ml-4 border-l border-zinc-200">
      {entries.map(entry => {
        const paid=entry.title==='Paid'||entry.title==='Bonus paid'
        const approved=entry.title==='Approved'
        const Icon=paid? Wallet:approved? Check:entry.title==='Rereview requested'? RotateCcw:entry.title.includes('scheduled')? Clock3:CalendarDays
        return <li key={entry.id} className="relative pb-7 pl-7 last:pb-1">
          <span className={`absolute -left-4 top-0 grid size-8 place-items-center rounded-full border-4 border-white ${paid||approved? 'bg-emerald-50 text-emerald-600':'bg-zinc-100 text-zinc-500'}`}><Icon aria-hidden="true" className="size-3.5" /></span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"><h4 className="text-sm font-semibold">{entry.title}{entry.amountCents!=null? <span className="ml-2 tabular-nums">{money(entry.amountCents,entry.currency)}</span>:null}</h4><time dateTime={entry.at} className="text-[11px] text-zinc-400">{timestamp(entry.at)}</time></div>
          {entry.views!=null||entry.audiencePercent!=null? <p className="mt-1.5 text-xs tabular-nums text-zinc-600">{[entry.views!=null? `${entry.views.toLocaleString('en-US')} views`:null,entry.audiencePercent!=null? `${entry.audiencePercent}% Tier 1 audience`:null].filter(Boolean).join(' · ')}</p>:null}
          {entry.campaign? <p className="mt-1 text-xs text-zinc-400">{entry.campaign}</p>:null}
          {entry.detail? <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-zinc-500">{entry.detail}</p>:null}
          {entry.reference? <p className="mt-1.5 break-all text-[11px] text-zinc-400">Receipt: {entry.reference}</p>:null}
        </li>
      })}
    </ol>
  </section>
}
