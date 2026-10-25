import { Sparkles } from 'lucide-react'
import { bonusPaymentStatus, bonusPaymentTotal, type BonusPayment } from '@/lib/creator/bonus-payments'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const money = (cents: number) => usd.format(cents / 100)

export function SubmissionBonusBreakdown({ contentCents, bonuses }: { contentCents: number; bonuses: readonly BonusPayment[] }) {
  if (!bonuses.length) return null
  return <section aria-label="Submission earnings and bonuses" className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/60 p-4">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-950"><Sparkles aria-hidden="true" className="size-4 text-amber-600" />Bonus earned</h3>
    <dl className="mt-3 grid gap-2.5 text-xs">
      <div className="flex justify-between gap-4 text-zinc-600"><dt>Post earnings</dt><dd className="tabular-nums">{money(contentCents)}</dd></div>
      {bonuses.map(bonus => <div key={bonus.id} className="flex items-start justify-between gap-4"><dt className="text-zinc-700">{bonus.bonusNote?.split(' · ')[0] || 'Campaign bonus'}<span className="mt-0.5 block text-[10px] text-zinc-500">{bonusPaymentStatus(bonus)}</span></dt><dd className="font-medium tabular-nums text-amber-800">+{money(bonus.amountCents)}</dd></div>)}
      <div className="flex justify-between gap-4 border-t border-amber-200/70 pt-2.5 text-sm font-semibold text-zinc-900"><dt>Total earnings</dt><dd className="tabular-nums">{money(contentCents + bonusPaymentTotal(bonuses))}</dd></div>
    </dl>
  </section>
}

export function CampaignBonusAwards({ bonuses }: { bonuses: readonly BonusPayment[] }) {
  if (!bonuses.length) return null
  return <section aria-label="Campaign bonuses" className="mb-5 rounded-2xl border border-amber-200/70 bg-white p-4">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles aria-hidden="true" className="size-4 text-amber-500" />Campaign bonuses</h2><span className="text-sm font-semibold tabular-nums text-amber-800">+{money(bonusPaymentTotal(bonuses))}</span></div>
    <p className="mt-1 text-xs text-zinc-500">Rewards across your posts, automatically added to your earnings.</p>
    <ul className="mt-3 grid gap-2">{bonuses.map(bonus => <li key={bonus.id} className="flex items-start justify-between gap-4 text-xs"><span className="text-zinc-700">{bonus.bonusNote || 'Campaign reward'}<span className="mt-0.5 block text-[10px] text-zinc-500">{bonusPaymentStatus(bonus)}</span></span><span className="shrink-0 font-medium tabular-nums">+{money(bonus.amountCents)}</span></li>)}</ul>
  </section>
}
