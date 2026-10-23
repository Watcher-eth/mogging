import { sprintMoney, type CreatorSprint } from '@/lib/creator/sprints'

export function CampaignBudget({ sprint }: { sprint: CreatorSprint }) {
  const pools = [
    { label: 'Content budget', total: sprint.budgetCents, committed: sprint.usedCents, paid: sprint.paidCents ?? 0 },
    { label: 'Bonus budget', total: sprint.terms.bonusBudgetCents ?? 0, committed: sprint.bonusUsedCents ?? 0, paid: sprint.bonusPaidCents ?? 0 },
  ]
  return <section aria-label="Campaign budget usage" className="mt-5 grid gap-3 sm:grid-cols-2">
    {pools.map(pool => <div key={pool.label} className="rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-medium text-zinc-500">{pool.label}</h3><span className="text-sm font-semibold tabular-nums">{sprintMoney(pool.total)}</span></div>
      <div role="meter" aria-label={`${pool.label} committed`} aria-valuemin={0} aria-valuemax={pool.total} aria-valuenow={pool.committed} className="my-3 h-1 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-400" style={{ width: `${pool.total ? Math.min(100, pool.committed / pool.total * 100) : 0}%` }} /></div>
      <dl className="grid grid-cols-3 gap-2 text-[11px] tabular-nums">{[['Committed', pool.committed], ['Paid', pool.paid], ['Remaining', Math.max(0, pool.total - pool.committed)]].map(([label, cents]) => <div key={label}><dt className="text-zinc-400">{label}</dt><dd className="mt-1 font-medium text-zinc-700">{sprintMoney(Number(cents))}</dd></div>)}</dl>
      <p className="mt-2 text-[10px] text-zinc-400">Paid amounts are included in committed funds.</p>
    </div>)}
  </section>
}
