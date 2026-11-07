import Link from 'next/link'
import { CircleAlert, ArrowUpRight } from 'lucide-react'
import { creatorMissingPaymentData } from '@/lib/creator/money'
import type { CreatorDashboard } from './types'

export function MissingPaymentData({ data }: { data?: CreatorDashboard }) {
  if (!data || !creatorMissingPaymentData(data.profile, data.submissions, data.payments)) return null
  return <aside role="status" className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
    <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Missing Payment Data</p><p className="mt-1 text-xs leading-5">You have approved earnings awaiting payment. Add the missing details for your selected payout method so we can pay you.</p></div>
    <Link href="/creator/money?tab=methods" className="inline-flex min-h-10 items-center gap-1 rounded-full bg-white px-4 text-xs font-semibold shadow-sm">Add payout details <ArrowUpRight className="size-3.5" /></Link>
  </aside>
}
