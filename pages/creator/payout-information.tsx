import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { ChevronDown, Clock3, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { CreatorAuthPrompt } from '@/components/creator/creator-auth-prompt'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { PayoutInformation } from '@/components/creator/payout-information-form'
import { CreatorIcon, CreatorStatusIcon } from '@/components/creator/creator-icon'
import type { CreatorDashboard, CreatorPayment } from '@/components/creator/types'
import { apiGet } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const paymentLabels: Record<CreatorPayment['status'], string> = {
  pending: 'Pending', processing: 'Processing', paid: 'Sent', failed: 'Failed', cancelled: 'Cancelled',
}

export default function CreatorPayoutInformationPage() {
  const { data: session, status } = useSession()
  return (
    <CreatorShell allowUnauthenticated>
      {status === 'unauthenticated' ? <CreatorAuthPrompt callbackUrl="/creator/payout-information" /> : status === 'authenticated' ? <PayoutsContent email={session.user?.email || ''} /> : null}
    </CreatorShell>
  )
}

function PayoutsContent({ email }: { email: string }) {
  const { data, isLoading } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const [filter, setFilter] = useState<'all' | CreatorPayment['status']>('all')
  const approved = data?.profile?.authStatus === 'verified'
  const payments = data?.payments || []
  const visible = filter === 'all' ? payments : payments.filter((payment) => payment.status === filter)

  if (isLoading) return <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div>
  if (!data) return <p className="text-sm text-zinc-500">Could not load your payouts.</p>

  return (
    <>
      <CreatorHeader eyebrow={approved ? 'History & Payments' : 'Payment Destination'} title={approved ? 'Payouts' : 'Payout Information'} description={approved ? 'Follow your pending payouts and completed payments.' : 'Choose where to receive your approved earnings.'} titleAccessory={<span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#00A8EF] px-3 py-1.5 text-xs font-semibold text-white"><Clock3 className="size-3.5" aria-hidden="true" />3-5 Day</span>} />
      {approved ? (
        <details className="creator-surface group mb-6">
          <summary className="flex cursor-pointer list-none items-center gap-3 p-5 sm:p-7 [&::-webkit-details-marker]:hidden">
            <CreatorStatusIcon name="payouts" verified />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Payment Method Approved</span><span className="mt-1 block text-xs text-zinc-500">{data.profile?.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'} · View or edit your payment destination</span></span>
            <ChevronDown className="size-4 shrink-0 text-zinc-400 transition-transform duration-150 group-open:rotate-180" />
          </summary>
          <div className="border-t border-zinc-100 p-5 sm:p-7"><PayoutInformation email={email} embedded /></div>
        </details>
      ) : <PayoutInformation email={email} />}
      {approved || payments.length ? (
        <section className={cn(!approved && 'mt-8')} aria-label="Payout history">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold tracking-[-0.035em]">Payout history</h2>
            <label className="flex items-center gap-3 text-sm font-medium">Status<select className="creator-field w-auto" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
              <option value="all">All ({payments.length})</option>
              {Object.entries(paymentLabels).map(([value, label]) => <option key={value} value={value}>{label} ({payments.filter((payment) => payment.status === value).length})</option>)}
            </select></label>
          </div>
          {visible.length ? <div className="grid gap-3">{visible.map((payment) => (
            <article key={payment.id} className="creator-surface flex flex-wrap items-center gap-3 p-4">
              <CreatorIcon name="payouts" className="size-12" />
              <div className="min-w-0 flex-1"><h3 className="text-sm font-semibold">{data.submissions.find((submission) => submission.id === payment.submissionId)?.title || 'Creator payout'}</h3><p className="mt-0.5 text-xs text-zinc-500">{payment.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'}{payment.paidAt ? ` · Sent ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(payment.paidAt))}` : ''}</p></div>
              <p className="text-sm font-semibold tabular-nums">{new Intl.NumberFormat('en-US', { style: 'currency', currency: payment.currency, maximumFractionDigits: 2 }).format(payment.amountCents / 100)}</p>
              <span className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold', payment.status === 'paid' ? 'creator-tone-green' : payment.status === 'processing' ? 'creator-tone-blue' : payment.status === 'failed' ? 'creator-tone-red' : 'bg-[#f5f6f7] text-[#52565c]')}>{paymentLabels[payment.status]}</span>
            </article>
          ))}</div> : <div className="creator-surface grid min-h-52 place-items-center p-6 text-center"><div><CreatorIcon name="payouts" className="mx-auto mb-3 size-10" /><p className="text-sm font-semibold">{filter === 'all' ? 'No payouts yet' : `No ${paymentLabels[filter].toLowerCase()} payouts`}</p><p className="mt-2 text-xs leading-5 text-zinc-500">{filter === 'all' ? 'Payouts will appear here when payments for your approved videos are scheduled.' : 'Choose another status to see your other payouts.'}</p></div></div>}
        </section>
      ) : null}
    </>
  )
}
