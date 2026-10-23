import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import type { AdminPayment } from './creator-types'
import { remainingCreatorPaymentCents } from '@/lib/creator/money'

const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export function SubmissionPayoutSummary({ totalCents, payments }: { totalCents: number | null; payments: AdminPayment[] }) {
  const settled = payments.filter(payment => payment.status === 'paid')
  const paidCents = settled.reduce((sum, payment) => sum + payment.amountCents, 0)
  const scheduledCents = payments.filter(payment => payment.status === 'pending' || payment.status === 'processing').reduce((sum, payment) => sum + payment.amountCents, 0)
  const remainingCents = totalCents === null ? null : remainingCreatorPaymentCents(totalCents, payments)

  return <section aria-label="Submission payout summary" className="mt-5 rounded-2xl border border-zinc-200 p-4">
    <h3 className="text-sm font-semibold">Earnings breakdown</h3>
    <dl className="mt-4 space-y-3 text-sm tabular-nums">
      <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">Milestone total</dt><dd className="font-medium">{totalCents === null ? '—' : money(totalCents)}</dd></div>
      <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">Already paid</dt><dd className="font-medium">{money(paidCents)}</dd></div>
      {scheduledCents > 0 ? <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">Already scheduled</dt><dd className="font-medium">{money(scheduledCents)}</dd></div> : null}
      <div className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-3"><dt className="font-semibold">Additional to pay</dt><dd className="text-xl font-semibold tracking-tight">{remainingCents === null ? '—' : money(remainingCents)}</dd></div>
    </dl>
    <p className="mt-2 text-xs leading-5 text-zinc-500">Total for this video minus settled and scheduled payments. Failed and cancelled payments are excluded.</p>
    {settled.length > 0 ? <Disclosure className="mt-4 border-t border-zinc-100 pt-3">
      <DisclosureSummary className="min-h-8 cursor-pointer text-xs font-medium">Paid history ({settled.length})</DisclosureSummary><AccordionContent>
      <ul className="mt-2 divide-y divide-zinc-100">{settled.map(payment => <li key={payment.id} className="flex items-start justify-between gap-4 py-3 text-xs">
        <div className="min-w-0"><p className="font-medium">{payment.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'} · {date(payment.paidAt || payment.createdAt)}</p>{payment.providerReference ? <p className="mt-1 break-all text-zinc-500">{payment.providerReference}</p> : null}{payment.hasReceipt ? <a href={`/api/admin/creator/payments/${payment.id}/receipt`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center text-[#007aff] underline underline-offset-4">View receipt</a> : null}</div>
        <span className="shrink-0 font-semibold tabular-nums">{money(payment.amountCents, payment.currency)}</span>
      </li>)}</ul>
    </AccordionContent></Disclosure> : null}
  </section>
}
