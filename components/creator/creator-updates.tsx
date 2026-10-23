import Link from 'next/link'
import { ArrowUpRight, Check, Clock3, MessageCircle, Megaphone, RotateCcw, Send, Wallet, X } from 'lucide-react'
import type { CreatorDashboard } from './types'
import { creatorActivity, creatorUpdateLabels, type CreatorUpdateType } from '@/lib/creator/updates'

const icons = { submitted: Send, pending: Clock3, in_review: Clock3, approved: Check, rejected: X, paid: Wallet, rereview_requested: RotateCcw, feedback: MessageCircle }
const currentLabels: Partial<Record<CreatorUpdateType, string>> = { in_review: 'Post currently in review', approved: 'Approved post', rejected: 'Post needs changes' }

export function CreatorUpdates({ data }: { data: CreatorDashboard }) {
  const updates = creatorActivity(data.updates || [], data.submissions, data.payments).slice(0, 8)
  return (
    <section aria-label="Updates" className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold">Updates</h2>
        {updates.length ? <Link href="/creator/submissions" className="inline-flex min-h-11 items-center gap-1 text-xs font-medium text-[#008bc6]">View submissions<ArrowUpRight className="size-3.5" /></Link> : null}
      </div>
      {updates.length ? <ul className="mt-2 divide-y divide-zinc-100">
        {updates.map(update => {
          const Icon = icons[update.type]
          return <li key={update.id}>
            <Link href="/creator/submissions" className="group flex items-start gap-3 rounded-xl py-4 transition-colors hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007aff] sm:gap-4">
              <span className={`grid size-10 shrink-0 place-items-center rounded-full ${update.type === 'approved' || update.type === 'paid' ? 'bg-emerald-50 text-emerald-600' : update.type === 'rejected' ? 'bg-orange-50 text-orange-600' : 'bg-zinc-100 text-zinc-500'}`}><Icon className="size-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{update.snapshot ? currentLabels[update.type] : creatorUpdateLabels[update.type]}</span>
                <span className="mt-1 block truncate text-[13px] text-zinc-500">{update.title}</span>
                {update.note ? <span className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-zinc-600">{update.note}</span> : null}
              </span>
              {update.snapshot ? <span className="pt-0.5 text-right text-[11px] text-zinc-400">Current status</span> : <time dateTime={update.createdAt} title={new Date(update.createdAt).toLocaleString()} className="shrink-0 pt-0.5 text-right text-[11px] text-zinc-400">{new Date(update.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</time>}
            </Link>
          </li>
        })}
      </ul> : <p className="mt-3 text-sm leading-6 text-zinc-500">Your reviews, approvals, and payouts will appear here after you submit a post.</p>}
      <Link href="/creator/sprints" className="mt-4 flex items-center gap-3 rounded-2xl border border-zinc-100 p-4 transition-colors hover:bg-zinc-50">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-50 text-[#008bc6]"><Megaphone className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Explore current campaigns</span><span className="mt-0.5 block text-xs leading-5 text-zinc-500">See open campaigns, budgets, and content requirements.</span></span>
        <ArrowUpRight className="size-4 shrink-0 text-zinc-400" aria-hidden="true" />
      </Link>
    </section>
  )
}
