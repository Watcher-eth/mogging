import type { BonusTarget } from '@/lib/creator/campaign-bonuses'
import { bonusPaymentStatus, bonusPaymentTotal } from '@/lib/creator/bonus-payments'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import type { AdminPayment } from './creator-types'
import { remainingCreatorPaymentCents } from '@/lib/creator/money'

const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

export function SubmissionPayoutSummary({ totalCents, payments, bonuses = [], projectedBonuses = [] }: { totalCents: number | null; payments: AdminPayment[]; bonuses?: AdminPayment[]; projectedBonuses?: BonusTarget[] }) {
  const bonusCents = bonusPaymentTotal(bonuses) + projectedBonuses.reduce((sum, bonus) => sum + bonus.cents, 0)
  const combinedTotalCents = totalCents === null ? null : totalCents + bonusCents
  const settled = [...payments, ...bonuses].filter(payment => payment.status === 'paid')
  // An automatic bonus is owed immediately; it is reserved only once included
  // in an actual payout request or processing transfer.
  const reserved = [...payments, ...bonuses.filter(payment => payment.status !== 'pending' || payment.payoutRequestId)]
  const paidCents = settled.reduce((sum, payment) => sum + payment.amountCents, 0)
  const scheduledCents = reserved.filter(payment => payment.status === 'pending' || payment.status === 'processing').reduce((sum, payment) => sum + payment.amountCents, 0)
  const remainingCents = combinedTotalCents === null ? null : remainingCreatorPaymentCents(combinedTotalCents, reserved)

  return <section aria-label="Submission payout summary" className="mt-5 rounded-2xl border border-zinc-200 p-4">
    <h3 className="text-sm font-semibold">Earnings breakdown</h3>
    <dl className="mt-4 space-y-3 text-sm tabular-nums">
      <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">Milestone total</dt><dd className="font-medium">{totalCents === null ? '—' : money(totalCents)}</dd></div>
      {bonuses.map(bonus => <div key={bonus.id} className="flex items-start justify-between gap-4 text-amber-800"><dt>{bonus.bonusNote?.split(' · ')[0] || 'Bonus'}<span className="mt-0.5 block text-xs text-zinc-500">{bonusPaymentStatus(bonus)}</span></dt><dd className="font-medium">+{money(bonus.amountCents)}</dd></div>)}
      {projectedBonuses.map(bonus => <div key={bonus.subject} className="flex items-start justify-between gap-4 text-amber-800"><dt>{bonus.label}<span className="mt-0.5 block text-xs text-zinc-500">Automatically added on approval</span></dt><dd className="font-medium">+{money(bonus.cents)}</dd></div>)}
      {bonusCents > 0 ? <div className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-3"><dt className="font-semibold">Total earnings including bonuses</dt><dd className="font-semibold">{combinedTotalCents === null ? '—' : money(combinedTotalCents)}</dd></div> : null}
      <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">Already paid</dt><dd className="font-medium">{money(paidCents)}</dd></div>
      {scheduledCents > 0 ? <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">Already scheduled</dt><dd className="font-medium">{money(scheduledCents)}</dd></div> : null}
      <div className="flex items-center justify-between gap-4 border-t border-zinc-100 pt-3"><dt className="font-semibold">Additional to pay</dt><dd className="text-xl font-semibold tracking-tight">{remainingCents === null ? '—' : money(remainingCents)}</dd></div>
    </dl>
    <p className="mt-2 text-xs leading-5 text-zinc-500">{projectedBonuses.length ? 'Includes bonuses for the verified metrics above. Save approval to add them to the creator’s earnings.' : 'Post earnings and bonuses minus settled and scheduled payments. Failed and cancelled payments are excluded.'}</p>
    {settled.length > 0 ? <Disclosure className="mt-4 border-t border-zinc-100 pt-3">
      <DisclosureSummary className="min-h-8 cursor-pointer text-xs font-medium">Paid history ({settled.length})</DisclosureSummary><AccordionContent>
      <ul className="mt-2 divide-y divide-zinc-100">{settled.map(payment => <li key={payment.id} className="flex items-start justify-between gap-4 py-3 text-xs">
        <div className="min-w-0"><p className="font-medium">{payment.paymentOption === 'paypal' ? 'PayPal' : 'Crypto'} · {date(payment.paidAt || payment.createdAt)}</p>{payment.providerReference ? <p className="mt-1 break-all text-zinc-500">{payment.providerReference}</p> : null}{payment.hasReceipt ? <a href={`/api/admin/creator/payments/${payment.id}/receipt`} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-8 items-center text-[#007aff] underline underline-offset-4">View receipt</a> : null}</div>
        <span className="shrink-0 font-semibold tabular-nums">{money(payment.amountCents, payment.currency)}</span>
      </li>)}</ul>
    </AccordionContent></Disclosure> : null}
  </section>
}
