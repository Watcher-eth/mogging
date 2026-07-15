import { useState } from 'react'
import {
  Calculator,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  MousePointerClick,
  Save,
  Settings2,
  Smartphone,
  TrendingUp,
  TriangleAlert,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { AdminDashboard, AdminPayment, AdminSubmission } from './creator-types'
import { calculateCreatorEconomics, type FunnelMetrics } from '@/lib/admin/creator-economics'
import { apiPatch, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

const emptyMetrics: FunnelMetrics = {
  qualifiedViews: 0,
  linkClicks: 0,
  installs: 0,
  firstTimePaidCustomers: 0,
}

export function CreatorEconomicsDashboard({ data, onSelectSubmission, onRefresh }: { data: AdminDashboard; onSelectSubmission: (submission: AdminSubmission) => void; onRefresh: () => Promise<void> }) {
  const [monthlyPrice, setMonthlyPrice] = useState((data.settings.monthlySubscriptionCents / 100).toFixed(2))
  const [margin, setMargin] = useState((data.settings.ninetyDayContributionMarginCents / 100).toFixed(2))
  const [saving, setSaving] = useState(false)
  const metricsBySubmission = new Map(data.attributionMetrics.map((metrics) => [metrics.submissionId, metrics]))
  const paymentsBySubmission = buildPaymentsBySubmission(data.payments)

  const economicsSettings = {
    ninetyDayContributionMarginCents: data.settings.ninetyDayContributionMarginCents,
    compensationCapRate: data.rules.compensationCapRate,
    conversionBonusCapRate: data.rules.conversionBonusCapRate,
  }
  const aggregateMetrics = data.attributionMetrics.reduce<FunnelMetrics>((total, item) => ({
    qualifiedViews: total.qualifiedViews + item.qualifiedViews,
    linkClicks: total.linkClicks + item.linkClicks,
    installs: total.installs + item.installs,
    firstTimePaidCustomers: total.firstTimePaidCustomers + item.firstTimePaidCustomers,
  }), { ...emptyMetrics })
  const aggregate = calculateCreatorEconomics(aggregateMetrics, data.payments, economicsSettings)
  const videoRows = data.submissions.map((submission) => {
    const metrics = metricsBySubmission.get(submission.id) || emptyMetrics
    const economics = calculateCreatorEconomics(metrics, paymentsBySubmission.get(submission.id) || [], economicsSettings)
    return { submission, economics }
  }).sort((left, right) => right.economics.contributionAfterCompensationCents - left.economics.contributionAfterCompensationCents)
  const creatorRows = buildCreatorRows(data, metricsBySubmission, paymentsBySubmission)

  async function saveSettings() {
    const monthlySubscriptionCents = Math.round(Number(monthlyPrice) * 100)
    const ninetyDayContributionMarginCents = Math.round(Number(margin) * 100)
    if (!Number.isFinite(monthlySubscriptionCents) || monthlySubscriptionCents <= 0) return toast.error('Enter the monthly subscription price')
    if (!Number.isFinite(ninetyDayContributionMarginCents) || ninetyDayContributionMarginCents < 0) return toast.error('Enter the 90-day contribution margin')
    setSaving(true)
    try {
      await apiPatch('/api/admin/creator/settings', { monthlySubscriptionCents, ninetyDayContributionMarginCents })
      toast.success('Program economics updated')
      await onRefresh()
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not update program economics')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Attribution & unit economics</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">Creator performance</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">Measure the full funnel from qualified view to first-time paying customer, then keep creator compensation inside the 90-day profitability envelope.</p></div>
        <span className={cn('inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold', aggregate.attributableMarginCents === 0 ? 'bg-zinc-100 text-zinc-600' : aggregate.isWithinCompensationCap ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>{aggregate.attributableMarginCents === 0 ? <Calculator className="size-3.5" /> : aggregate.isWithinCompensationCap ? <CheckCircle2 className="size-3.5" /> : <TriangleAlert className="size-3.5" />}{aggregate.attributableMarginCents === 0 ? 'Margin data needed' : aggregate.isWithinCompensationCap ? 'Within profitability rule' : 'Creator budget exceeds cap'}</span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <EconomicsMetric label="Qualified views" value={formatNumber(aggregate.qualifiedViews)} detail={`${formatPercent(aggregate.linkCtr)} link CTR`} icon={Eye} />
        <EconomicsMetric label="First-time paid" value={formatNumber(aggregate.firstTimePaidCustomers)} detail={`${formatPercent(aggregate.installToPaidConversion)} install → paid`} icon={UserCheck} />
        <EconomicsMetric label="90-day margin" value={formatMoney(aggregate.attributableMarginCents)} detail="Attributable contribution margin" icon={TrendingUp} />
        <EconomicsMetric label="Committed comp" value={formatMoney(aggregate.committedCompensationCents)} detail={`${formatPercent(aggregate.compensationShare)} of attributable margin`} icon={CircleDollarSign} warning={aggregate.attributableMarginCents > 0 && !aggregate.isWithinCompensationCap} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SmallMetric label="Sustainable creator RPM" value={formatMoney(aggregate.sustainableRpmCents)} />
        <SmallMetric label="Actual creator RPM" value={formatMoney(aggregate.actualRpmCents)} />
        <SmallMetric label="Creator CAC" value={aggregate.firstTimePaidCustomers ? formatMoney(aggregate.creatorCacCents) : '—'} />
        <SmallMetric label="90-day margin ROAS" value={aggregate.committedCompensationCents ? `${aggregate.ninetyDayRoas.toFixed(2)}×` : '—'} />
      </div>

      <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Funnel metrics={aggregate} />
        <ProgramSettings monthlyPrice={monthlyPrice} margin={margin} setMonthlyPrice={setMonthlyPrice} setMargin={setMargin} saving={saving} onSave={() => void saveSettings()} data={data} aggregate={aggregate} />
      </div>

      <div className="mt-7 rounded-[28px] border border-zinc-200 bg-zinc-950 p-5 text-white sm:p-7">
        <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10"><Calculator className="size-5" /></span><div><p className="text-sm font-semibold">Profitability rule</p><p className="mt-1 text-sm leading-6 text-zinc-400">Total committed creator compensation must stay at or below 35% of attributable users’ 90-day contribution margin.</p></div></div>
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 font-mono text-xs leading-6 text-zinc-300">1,000 × link CTR × click-to-install × install-to-paid × 90-day margin/customer × 35%</div>
        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><DarkStat label="Affordable compensation" value={formatMoney(aggregate.compensationCapCents)} /><DarkStat label="Contribution after compensation" value={formatMoney(aggregate.contributionAfterCompensationCents)} negative={aggregate.contributionAfterCompensationCents < 0} /><DarkStat label="Max conversion bonus/customer" value={formatMoney(aggregate.maxConversionBonusCents)} /></div>
      </div>

      <PerformanceTable title="Video economics" description="Click a video to enter or update its funnel data." rows={videoRows} onSelect={onSelectSubmission} />
      <CreatorPerformanceTable rows={creatorRows} />
    </section>
  )
}

function Funnel({ metrics }: { metrics: ReturnType<typeof calculateCreatorEconomics> }) {
  const steps = [
    { label: 'Qualified views', value: metrics.qualifiedViews, rate: null, icon: Eye },
    { label: 'Link clicks', value: metrics.linkClicks, rate: metrics.linkCtr, icon: MousePointerClick },
    { label: 'Installs', value: metrics.installs, rate: metrics.clickToInstallConversion, icon: Smartphone },
    { label: 'First-time paid', value: metrics.firstTimePaidCustomers, rate: metrics.installToPaidConversion, icon: UserCheck },
  ]
  return <div className="rounded-[28px] border border-zinc-200 bg-white p-5 sm:p-6"><p className="text-sm font-semibold">Attribution funnel</p><p className="mt-1 text-xs leading-5 text-zinc-500">Each rate uses the previous stage as its denominator.</p><div className="mt-5 grid gap-2 sm:grid-cols-4">{steps.map((step, index) => { const Icon = step.icon; return <div key={step.label} className="relative rounded-2xl bg-zinc-50 p-4"><Icon className="size-4 text-zinc-400" /><p className="mt-5 text-2xl font-semibold tracking-[-0.045em]">{formatNumber(step.value)}</p><p className="mt-1 text-xs text-zinc-500">{step.label}</p>{index > 0 ? <p className="mt-3 text-[11px] font-semibold text-zinc-400">{formatPercent(step.rate || 0)} conversion</p> : <p className="mt-3 text-[11px] font-semibold text-zinc-400">Funnel entry</p>}</div> })}</div></div>
}

function ProgramSettings({ monthlyPrice, margin, setMonthlyPrice, setMargin, saving, onSave, data, aggregate }: { monthlyPrice: string; margin: string; setMonthlyPrice: (value: string) => void; setMargin: (value: string) => void; saving: boolean; onSave: () => void; data: AdminDashboard; aggregate: ReturnType<typeof calculateCreatorEconomics> }) {
  return <div className="rounded-[28px] border border-zinc-200 bg-white p-5 sm:p-6"><div className="flex items-center gap-2.5"><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Settings2 className="size-4" /></span><div><p className="text-sm font-semibold">Program assumptions</p><p className="text-xs text-zinc-500">Used across every creator calculation.</p></div></div><div className="mt-5 grid gap-4"><MoneyInput label="Monthly subscription" value={monthlyPrice} onChange={setMonthlyPrice} hint="Current price: $9.99" /><MoneyInput label="90-day contribution margin/customer" value={margin} onChange={setMargin} hint={`90-day gross revenue is ${formatMoney(data.settings.monthlySubscriptionCents * 3)}`} /></div><p className="mt-4 text-xs leading-5 text-zinc-500">Enter revenue after refunds, payment fees, hosting, and other variable costs—not the $29.97 gross subscription revenue.</p><Button className="mt-5 h-10 w-full rounded-xl" onClick={onSave} disabled={saving}>{saving ? <Save className="animate-pulse" /> : <Save />}{saving ? 'Saving…' : 'Save assumptions'}</Button><div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 text-xs"><span className="text-zinc-500">Conversion bonus ceiling</span><span className="font-semibold">{formatMoney(aggregate.maxConversionBonusCents)} / paid customer</span></div></div>
}

function PerformanceTable({ title, description, rows, onSelect }: { title: string; description: string; rows: Array<{ submission: AdminSubmission; economics: ReturnType<typeof calculateCreatorEconomics> }>; onSelect: (submission: AdminSubmission) => void }) {
  return <section className="mt-8"><div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Performance detail</p><h3 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">{title}</h3><p className="mt-2 text-sm text-zinc-500">{description}</p></div>{rows.length ? <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white"><div className="hidden grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(90px,0.7fr))] gap-3 border-b border-zinc-100 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400 lg:grid"><span>Video</span><span>Views</span><span>Paid</span><span>Max RPM</span><span>Actual RPM</span><span>Net margin</span></div>{rows.map(({ submission, economics }) => <button key={submission.id} onClick={() => onSelect(submission)} className="grid w-full gap-3 border-b border-zinc-100 px-4 py-4 text-left last:border-0 hover:bg-zinc-50 lg:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(90px,0.7fr))] lg:items-center"><span className="min-w-0"><span className="block truncate text-sm font-semibold">{submission.title}</span><span className="mt-1 block truncate text-xs text-zinc-500">{submission.creatorName} · {submission.socialHandle ? `@${submission.socialHandle}` : submission.platform}</span></span><TableValue label="Views" value={formatNumber(economics.qualifiedViews)} /><TableValue label="Paid" value={formatNumber(economics.firstTimePaidCustomers)} /><TableValue label="Max RPM" value={formatMoney(economics.sustainableRpmCents)} /><TableValue label="Actual RPM" value={formatMoney(economics.actualRpmCents)} warning={!economics.isWithinCompensationCap && economics.committedCompensationCents > 0} /><TableValue label="Net margin" value={formatMoney(economics.contributionAfterCompensationCents)} warning={economics.contributionAfterCompensationCents < 0} /></button>)}</div> : <div className="rounded-[28px] border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">Video economics will appear after the first creator submission.</div>}</section>
}

function CreatorPerformanceTable({ rows }: { rows: ReturnType<typeof buildCreatorRows> }) {
  return <section className="mt-8"><div className="mb-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Creator comparison</p><h3 className="mt-2 text-2xl font-semibold tracking-[-0.045em]">Creator profitability</h3><p className="mt-2 text-sm text-zinc-500">Ranked by 90-day contribution margin after committed compensation.</p></div>{rows.length ? <div className="grid gap-3">{rows.map((row, index) => <div key={row.creatorProfileId} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-xs font-semibold">{index + 1}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.creatorName}</span><span className="mt-1 block text-xs text-zinc-500">{formatNumber(row.economics.qualifiedViews)} views · {row.economics.firstTimePaidCustomers} paid customers</span></span><div className="grid grid-cols-3 gap-5 text-right"><CreatorValue label="Creator CAC" value={row.economics.firstTimePaidCustomers ? formatMoney(row.economics.creatorCacCents) : '—'} /><CreatorValue label="Comp share" value={formatPercent(row.economics.compensationShare)} /><CreatorValue label="Net margin" value={formatMoney(row.economics.contributionAfterCompensationCents)} warning={row.economics.contributionAfterCompensationCents < 0} /></div></div>)}</div> : null}</section>
}

function buildCreatorRows(data: AdminDashboard, metricsBySubmission: Map<string, AdminDashboard['attributionMetrics'][number]>, paymentsBySubmission: Map<string, AdminDashboard['payments']>) {
  const rows = new Map<string, { creatorProfileId: string; creatorName: string; metrics: FunnelMetrics; payments: AdminDashboard['payments'] }>()
  for (const submission of data.submissions) {
    const row = rows.get(submission.creatorProfileId) || { creatorProfileId: submission.creatorProfileId, creatorName: submission.creatorName, metrics: { ...emptyMetrics }, payments: [] }
    const metrics = metricsBySubmission.get(submission.id) || emptyMetrics
    row.metrics.qualifiedViews += metrics.qualifiedViews
    row.metrics.linkClicks += metrics.linkClicks
    row.metrics.installs += metrics.installs
    row.metrics.firstTimePaidCustomers += metrics.firstTimePaidCustomers
    row.payments.push(...(paymentsBySubmission.get(submission.id) || []))
    rows.set(submission.creatorProfileId, row)
  }
  const settings = { ninetyDayContributionMarginCents: data.settings.ninetyDayContributionMarginCents, compensationCapRate: data.rules.compensationCapRate, conversionBonusCapRate: data.rules.conversionBonusCapRate }
  return [...rows.values()].map((row) => ({ ...row, economics: calculateCreatorEconomics(row.metrics, row.payments, settings) })).sort((left, right) => right.economics.contributionAfterCompensationCents - left.economics.contributionAfterCompensationCents)
}

function buildPaymentsBySubmission(payments: AdminPayment[]) {
  const map = new Map<string, AdminPayment[]>()
  for (const payment of payments) {
    if (!payment.submissionId) continue
    map.set(payment.submissionId, [...(map.get(payment.submissionId) || []), payment])
  }
  return map
}

function EconomicsMetric({ label, value, detail, icon: Icon, warning = false }: { label: string; value: string; detail: string; icon: typeof Eye; warning?: boolean }) { return <div className={cn('rounded-2xl border bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.035)]', warning ? 'border-red-200' : 'border-zinc-200')}><div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">{label}</p><span className={cn('grid size-9 place-items-center rounded-xl', warning ? 'bg-red-50 text-red-600' : 'bg-zinc-100')}><Icon className="size-4" /></span></div><p className="mt-5 text-3xl font-semibold tracking-[-0.055em]">{value}</p><p className={cn('mt-1 text-xs', warning ? 'text-red-600' : 'text-zinc-400')}>{detail}</p></div> }
function SmallMetric({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-4 py-3"><span className="text-xs text-zinc-500">{label}</span><span className="text-sm font-semibold">{value}</span></div> }
function DarkStat({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) { return <div className="rounded-xl bg-white/[0.05] p-4"><p className="text-xs text-zinc-500">{label}</p><p className={cn('mt-2 text-lg font-semibold', negative && 'text-red-300')}>{value}</p></div> }
function MoneyInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint: string }) { return <label className="grid gap-2"><span className="flex items-center justify-between text-sm font-medium"><span>{label}</span><span className="text-[11px] font-normal text-zinc-400">{hint}</span></span><span className="relative"><span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span><input type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 pl-7 pr-3 text-sm outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100" /></span></label> }
function TableValue({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <span className="flex items-center justify-between lg:block"><span className="text-xs text-zinc-400 lg:hidden">{label}</span><span className={cn('text-sm font-medium', warning && 'text-red-600')}>{value}</span></span> }
function CreatorValue({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) { return <span><span className="block text-[10px] uppercase tracking-[0.08em] text-zinc-400">{label}</span><span className={cn('mt-1 block text-sm font-semibold', warning && 'text-red-600')}>{value}</span></span> }
function formatMoney(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) }
function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { notation: value >= 100_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function formatPercent(value: number) { return new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 }).format(value) }
