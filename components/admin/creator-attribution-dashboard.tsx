import { ArrowUpRight, Bot, CircleDollarSign, Download, MousePointerClick, RefreshCcw, ShoppingCart, UserPlus, UsersRound } from 'lucide-react'
import type { AdminAccount, AdminAttributionReport, AdminCreator, AdminDashboard } from '@/components/admin/creator-types'

export function CreatorAttributionDashboard({ data, onSelectCreator, onSelectAccount }: { data: AdminDashboard; onSelectCreator: (creator: AdminCreator) => void; onSelectAccount: (account: AdminAccount) => void }) {
  const overall = data.creators.reduce((total, creator) => addReports(total, creator.attribution), emptyReport())
  const creators = [...data.creators].sort((left, right) => right.attribution.revenueCents - left.attribution.revenueCents || right.attribution.clicks - left.attribution.clicks)
  const accountsByCreatorId = new Map<string, AdminAccount[]>()
  for (const account of data.accounts) {
    const creatorAccounts = accountsByCreatorId.get(account.creatorProfileId) || []
    creatorAccounts.push(account)
    accountsByCreatorId.set(account.creatorProfileId, creatorAccounts)
  }

  return (
    <section>
      <header className="mb-6"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Link performance</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.055em]">Creator attribution</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">See how each account-specific link moves people from a click to an install and paying customer. Revenue is net of recorded refunds and disputes.</p></header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryMetric label="Link Clicks" value={formatNumber(overall.clicks)} detail={`${formatNumber(overall.recentClicks)} in the last 30 days`} icon={MousePointerClick} />
        <SummaryMetric label="Installs" value={formatNumber(overall.installs)} detail={`${formatPercent(overall.installs, overall.clicks)} of clicks`} icon={Download} />
        <SummaryMetric label="Paid Customers" value={formatNumber(overall.paidCustomers)} detail={`${formatPercent(overall.paidCustomers, overall.installs)} of installs`} icon={UsersRound} />
        <SummaryMetric label="Net Revenue" value={formatMoney(overall.revenueCents)} detail={`${formatMoney(overall.recentRevenueCents)} in the last 30 days`} icon={CircleDollarSign} />
      </div>
      <div className="mt-7 rounded-[28px] border border-zinc-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.04)] sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">All creators</p><h3 className="mt-2 text-xl font-semibold tracking-[-0.035em]">Performance by creator</h3></div><p className="text-xs text-zinc-400">Lifetime totals · recent activity shows 30 days</p></div>
        {creators.length ? <div className="mt-5 grid gap-4">{creators.map((creator) => <CreatorAttributionCard key={creator.id} creator={creator} accounts={accountsByCreatorId.get(creator.id) || []} onSelectCreator={() => onSelectCreator(creator)} onSelectAccount={onSelectAccount} />)}</div> : <p className="mt-5 rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">Creator attribution will appear after accounts are connected.</p>}
      </div>
    </section>
  )
}

export function AccountAttributionReport({ report }: { report: AdminAttributionReport }) {
  return <AttributionReportFrame eyebrow="Account link report" title="Attribution performance" description="Lifetime results attributed directly to this account’s creator link." report={report} />
}

export function CreatorAttributionReport({ report, accountCount }: { report: AdminAttributionReport; accountCount: number }) {
  return <AttributionReportFrame eyebrow="Creator rollup" title="Attribution across accounts" description={`Combined lifetime performance across ${accountCount} connected ${accountCount === 1 ? 'account' : 'accounts'}.`} report={report} />
}

function CreatorAttributionCard({ creator, accounts, onSelectCreator, onSelectAccount }: { creator: AdminCreator; accounts: AdminAccount[]; onSelectCreator: () => void; onSelectAccount: (account: AdminAccount) => void }) {
  const report = creator.attribution
  return <article className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3"><button type="button" onClick={onSelectCreator} className="group flex w-full flex-col gap-4 rounded-xl bg-white p-4 text-left shadow-sm transition-transform duration-150 ease-out active:scale-[0.995] sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100"><UsersRound className="size-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{creator.displayName}</span><span className="mt-1 block text-xs text-zinc-500">{creator.accountCount} connected {creator.accountCount === 1 ? 'account' : 'accounts'} · {formatNumber(report.recentClicks)} recent clicks</span></span><span className="grid w-full grid-cols-2 gap-x-5 gap-y-2 sm:w-auto sm:grid-cols-4"><InlineMetric label="Clicks" value={formatNumber(report.clicks)} /><InlineMetric label="Installs" value={formatNumber(report.installs)} /><InlineMetric label="Paid" value={formatNumber(report.paidCustomers)} /><InlineMetric label="Net Revenue" value={formatMoney(report.revenueCents)} /></span><ArrowUpRight className="hidden size-4 shrink-0 text-zinc-300 transition-[color,transform] duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-black sm:block" /></button>{accounts.length ? <div className="mt-2 grid gap-2 sm:grid-cols-2">{accounts.map((account) => <button key={account.id} type="button" onClick={() => onSelectAccount(account)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-white active:scale-[0.99]"><span className="size-2 rounded-full bg-zinc-300" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">@{account.handle}</span><span className="mt-0.5 block text-[11px] capitalize text-zinc-400">{account.platform} · {formatNumber(account.attribution.clicks)} clicks · {formatNumber(account.attribution.paidCustomers)} paid</span></span><ArrowUpRight className="size-3.5 text-zinc-300" /></button>)}</div> : null}</article>
}

function AttributionReportFrame({ eyebrow, title, description, report }: { eyebrow: string; title: string; description: string; report: AdminAttributionReport }) {
  const funnel = [
    { label: 'Clicks', value: report.clicks, icon: MousePointerClick },
    { label: 'Signups', value: report.signups, icon: UserPlus },
    { label: 'Installs', value: report.installs, icon: Download },
    { label: 'Checkouts', value: report.checkouts, icon: ShoppingCart },
    { label: 'Paid Customers', value: report.paidCustomers, icon: CircleDollarSign },
  ]
  return <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">{eyebrow}</p><h3 className="mt-2 text-lg font-semibold tracking-[-0.03em]">{title}</h3><p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p><div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4"><ReportMetric label="Link Clicks" value={formatNumber(report.clicks)} detail={`${formatNumber(report.uniqueClicks)} unique`} /><ReportMetric label="Installs" value={formatNumber(report.installs)} detail={`${formatPercent(report.installs, report.clicks)} of clicks`} /><ReportMetric label="Paid Customers" value={formatNumber(report.paidCustomers)} detail={`${formatPercent(report.paidCustomers, report.installs)} of installs`} /><ReportMetric label="Net Revenue" value={formatMoney(report.revenueCents)} detail={`${formatMoney(report.grossRevenueCents)} gross`} /></div><div className="mt-5 overflow-x-auto rounded-xl bg-zinc-50 p-3"><div className="flex min-w-[520px] items-center">{funnel.map((step, index) => { const Icon = step.icon; return <div key={step.label} className="contents"><div className="min-w-0 flex-1 text-center"><span className="mx-auto grid size-8 place-items-center rounded-lg bg-white shadow-sm"><Icon className="size-3.5 text-zinc-500" /></span><p className="mt-2 text-base font-semibold">{formatNumber(step.value)}</p><p className="text-[10px] font-medium text-zinc-400">{step.label}</p></div>{index < funnel.length - 1 ? <ArrowUpRight className="size-3.5 shrink-0 rotate-45 text-zinc-300" /> : null}</div> })}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><DetailCard label="Last 30 Days" value={`${formatNumber(report.recentClicks)} clicks`} detail={`${formatNumber(report.recentInstalls)} installs · ${formatNumber(report.recentPaidCustomers)} paid · ${formatMoney(report.recentRevenueCents)} net`} icon={RefreshCcw} /><DetailCard label="First-Touch Credit" value={`${formatNumber(report.firstTouchPaidCustomers)} paid`} detail={`${formatNumber(report.firstTouchSignups)} signups · ${formatMoney(report.firstTouchRevenueCents)} net revenue`} icon={UserPlus} /><DetailCard label="Data Quality" value={`${formatNumber(report.botClicks)} bot clicks`} detail={`${formatNumber(report.refunds)} refunds · ${formatNumber(report.disputes)} disputes · ${formatMoney(report.reversedRevenueCents)} reversed`} icon={Bot} /></div></section>
}

function SummaryMetric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof MousePointerClick }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.035)]"><div className="flex items-center justify-between"><p className="text-sm font-medium text-zinc-500">{label}</p><span className="grid size-9 place-items-center rounded-xl bg-zinc-100"><Icon className="size-4" /></span></div><p className="mt-5 text-3xl font-semibold tracking-[-0.055em]">{value}</p><p className="mt-1 text-xs text-zinc-400">{detail}</p></div> }
function InlineMetric({ label, value }: { label: string; value: string }) { return <span><span className="block text-[10px] font-medium text-zinc-400">{label}</span><span className="mt-0.5 block truncate text-xs font-semibold">{value}</span></span> }
function ReportMetric({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="rounded-xl bg-zinc-50 p-3"><p className="text-[10px] font-medium text-zinc-400">{label}</p><p className="mt-2 text-xl font-semibold tracking-[-0.04em]">{value}</p><p className="mt-1 truncate text-[10px] text-zinc-400">{detail}</p></div> }
function DetailCard({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof RefreshCcw }) { return <div className="rounded-xl border border-zinc-100 p-3"><div className="flex items-center gap-2 text-[10px] font-medium text-zinc-400"><Icon className="size-3.5" />{label}</div><p className="mt-2 text-sm font-semibold">{value}</p><p className="mt-1 text-[10px] leading-4 text-zinc-400">{detail}</p></div> }
function emptyReport(): AdminAttributionReport { return { clicks: 0, uniqueClicks: 0, botClicks: 0, signups: 0, installs: 0, checkouts: 0, purchases: 0, paidCustomers: 0, refunds: 0, disputes: 0, grossRevenueCents: 0, reversedRevenueCents: 0, revenueCents: 0, firstTouchSignups: 0, firstTouchPaidCustomers: 0, firstTouchRevenueCents: 0, recentClicks: 0, recentSignups: 0, recentInstalls: 0, recentPaidCustomers: 0, recentRevenueCents: 0 } }
function addReports(left: AdminAttributionReport, right: AdminAttributionReport) { const total = emptyReport(); for (const key of Object.keys(total) as Array<keyof AdminAttributionReport>) total[key] = left[key] + right[key]; return total }
function formatNumber(value: number) { return new Intl.NumberFormat('en-US', { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value) }
function formatMoney(cents: number) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100) }
function formatPercent(numerator: number, denominator: number) { return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : '0.0%' }
