import { useState } from 'react'
import Link from 'next/link'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { observedCompensationPerPayer } from '@/lib/admin/creator-economics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, money } from './analytics-ui'

const metrics: ChartMetric[] = [{ key: 'net', label: 'Directly attributed net revenue', color: chartColors.green }, { key: 'cash_paid', label: 'Creator cash payments', color: chartColors.blue }]
const cashMetrics = [metrics[1]]
const billingStatus: Record<string, string> = { allocated: 'Creator credit recorded', no_eligible_touch: 'No eligible creator touch', missing_identity: 'Customer identity unavailable', initial_purchase_missing: 'Initial purchase unavailable', missing_amount: 'Payment amount unavailable', pending: 'Awaiting allocation', not_applicable: 'Creator credit not applicable' }
const usd = (value: unknown) => money(value, 'USD')
const time = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No record available'
export function CreatorEconomicsOverview({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const [scope, setScope] = useState('period')
  const [metric, setMetric] = useState('paid')
  const [search, setSearch] = useState('')
  const report = data.creatorEconomics
  if (!report) return <Notice>Creator economics could not be established from this snapshot. Missing data is not shown as zero.</Notice>
  const summary = report.summary[0]
  const coverage = report.coverage[0]
  const zeroRevenueSeries = report.daily.length > 0 && report.daily.every(row => Number(row.net) === 0)
  const rows: MetricRow[] = report.creators.filter(row => String(row.creator).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((row): MetricRow => ({ ...row,
    payers: scope === 'period' ? row.period_payers : row.lifetime_payers,
    net: scope === 'period' ? row.period_net : row.lifetime_net,
    paid: scope === 'period' ? row.period_paid : row.lifetime_paid,
    committed: Number(row.lifetime_paid) + Number(row.scheduled),
    observed_compensation_per_payer: observedCompensationPerPayer(Number(row.lifetime_paid), Number(row.scheduled), Number(row.lifetime_payers)),
  })).filter(row => scope === 'lifetime' ? Number(row.lifetime_paid) !== 0 || Number(row.scheduled) !== 0 || Number(row.lifetime_net) !== 0 || Number(row.lifetime_payers) > 0 : Number(row.period_paid) !== 0 || Number(row.period_net) !== 0 || Number(row.period_payers) > 0)
    .sort((a, b) => Number(b[metric]) - Number(a[metric]))
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · All creators and compensation types · Direct revenue credit · USD · Pacific time</p>
    <p className="mb-5 text-sm leading-6 text-zinc-500">Revenue follows recorded creator credit. Cash follows completed payment dates. Scheduled compensation is a current balance, independent of the period filter.</p>
    <div className="admin-stats-grid">
      <Stat title="Attributed net revenue" value={usd(summary?.net)} note="Selected period · USD payments less refunds and disputes · before fees and taxes" />
      <Stat title="Attributed paying customers" value={count(summary?.paying_customers)} note="Selected period · distinct recorded identities with positive USD creator-attributed payments" />
      <Stat title="Creator cash paid" value={usd(summary?.cash_paid)} note="Completed USD payments dated in this period · posts, bonuses and referral awards" />
      <Stat title="Scheduled compensation" value={usd(summary?.scheduled)} note="Current pending/processing USD transfers · excludes earned amounts without a payment record" />
    </div>
    {Number(summary?.paying_customers) === 0 ? <p className="mb-5 text-sm leading-6 text-zinc-500">No positive USD creator-attributed payments were recorded in this period. This does not establish zero company revenue or zero creator impact. Acquisition cost per paying customer is not measurable from this slice.</p> : null}
    <Panel title="Attributed revenue and creator payments" description={`${days === 1 ? 'Hourly' : 'Daily'} recorded activity · USD · different revenue and payment timing`}
      note="Source: creator attribution ledger and completed creator payment records. Linked monetary attribution uses normalized provider event time; legacy records without billing linkage use attribution-record time. Cash uses paid-at time, including payments for earlier work. Revenue and compensation do not share an acquisition cohort. These series are an activity comparison, not profit, contribution margin, payback, CAC or causal ROAS. Store/payment fees, taxes, other acquisition costs and unallocated billing are not included. Empty buckets show zero recorded monetary credit or completed cash payments; they do not establish complete collection or zero company revenue. Boundary buckets are partial.">
      <AnalyticsChart title="Attributed revenue and creator payments" rows={report.daily} metrics={zeroRevenueSeries ? cashMetrics : metrics} days={days} currency="USD" />
      {zeroRevenueSeries ? <p className="mt-3 text-xs leading-5 text-zinc-500">Attributed net revenue is recorded as zero throughout this period; the chart shows cash payments.</p> : null}
      <DataDetails><Table rows={report.daily.map(row => ({ ...row, net: usd(row.net), cash_paid: usd(row.cash_paid) }))} columns={['day', 'net', 'cash_paid']} /></DataDetails>
    </Panel>
    <Panel title="Creator economics comparison" description={scope === 'period' ? 'Selected period · direct USD revenue and payment-date compensation' : 'Current lifetime totals · direct USD revenue and recorded compensation'}
      action={<div className="flex flex-wrap gap-3"><input aria-label="Search creators" placeholder="Search creators…" value={search} onChange={event => setSearch(event.target.value)} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400" /><AnalyticsSelect label="Scope" value={scope} onChange={setScope} options={[{ value: 'period', label: 'Selected period' }, { value: 'lifetime', label: 'All time' }]} /><AnalyticsSelect label="Compare" value={metric} onChange={setMetric} options={[{ value: 'paid', label: 'Cash paid' }, { value: 'net', label: 'Attributed revenue' }, { value: 'payers', label: 'Paying customers' }]} /></div>}
      note="Overall payer counts are deduplicated independently; creator rows can overlap and must not be summed. Lifetime committed compensation equals paid plus pending/processing payment records, including bonuses and referrals. It excludes failed/cancelled records and approved earnings without a payment record. The lifetime observed compensation-per-payer ratio is descriptive, uses USD payers only, and is unavailable without credited payers. It is not incremental CAC or a matched-cohort acquisition estimate. No modeled contribution-margin assumption is used here.">
      {rows.length > 0 && rows.every(row => Number(row[metric]) === 0) ? <p className="admin-empty">All recorded values for this metric are zero in the selected scope. Exact figures remain available below.</p> : <Bars animated labelWidth={180} rows={rows.slice(0, 10).map(row => ({ label: String(row.creator), value: Number(row[metric]), detail: `${count(row.payers)} credited identities · ${usd(row.paid)} paid · ${usd(row.net)} attributed net` }))} format={metric === 'payers' ? count : usd} />}
      <DataDetails><Table rows={rows.map(row => ({ creator: row.creator, paying_customers: row.payers, attributed_net_revenue: usd(row.net), cash_paid: usd(row.paid), ...(scope === 'lifetime' ? { scheduled: usd(row.scheduled), committed_compensation: usd(row.committed), observed_compensation_per_payer: usd(row.observed_compensation_per_payer) } : {}) }))} columns={scope === 'lifetime' ? ['creator', 'paying_customers', 'attributed_net_revenue', 'cash_paid', 'scheduled', 'committed_compensation', 'observed_compensation_per_payer'] : ['creator', 'paying_customers', 'attributed_net_revenue', 'cash_paid']} /><p className="mt-3 text-xs text-zinc-500">Chart shows the top ten matches. The table retains every match; searches only filter this comparison.</p></DataDetails>
    </Panel>
    <Panel title="Compensation position" description="Current all-time USD payment records across all creators. Independent of the period filter."
      note="Includes post payouts, bonuses, referral awards and other creator payment records. Paid records with unknown payment dates remain in lifetime paid totals but cannot enter the period chart. Pending/processing balances can change as payments complete or cancel; they are not cumulative spend. Approved unpaid earnings without a scheduled payment are outside committed compensation. Creator Performance provides the separate post-earned balance view and preserves its existing experimental exclusions; this Economics report includes all creators.">
      <div className="grid gap-6 sm:grid-cols-2"><Stat title="Total compensation paid" value={usd(summary?.lifetime_paid)} note="All-time completed USD payments · includes records without payment dates" /><Stat title="Committed compensation" value={summary ? usd(Number(summary.lifetime_paid) + Number(summary.scheduled)) : '—'} note="Paid plus scheduled payment records · not total earned obligations" /></div>
    </Panel>
    <Panel title="Attribution coverage" description="Why recorded billing may not have creator credit. Selected period · all currencies.">
      <p className="mb-4 text-sm leading-6 text-zinc-500">{count(coverage?.unallocated_payments)} positive billing records have no allocated creator credit. Customers may have no eligible creator touch, missing identity, or pending reconciliation; these are not automatically lost sales.</p>
      <Table rows={report.billing.map(row => ({ ...row, provider: row.provider === 'revenuecat' ? 'RevenueCat' : row.provider === 'stripe' ? 'Stripe' : row.provider, status: billingStatus[String(row.status)] ?? label(String(row.status)) }))} columns={['provider', 'status', 'events']} /><p className="mt-3 text-xs leading-5 text-zinc-500">The table counts qualifying subscription starts, trials, renewals, invoices, one-off payments and refunds. These event counts can differ from positive-payment counts and are not distinct customers.</p>
      <DataDetails><h3 className="mb-3 text-sm font-medium">Revenue and compensation by currency</h3><Table rows={report.currencies.map(row => ({ currency: row.currency, period_net_revenue: money(row.net, String(row.currency)), period_cash_paid: money(row.cash_paid, String(row.currency)), lifetime_cash_paid: money(row.lifetime_paid, String(row.currency)), current_scheduled: money(row.scheduled, String(row.currency)) }))} columns={['currency', 'period_net_revenue', 'period_cash_paid', 'lifetime_cash_paid', 'current_scheduled']} /><p className="mt-3 text-xs text-zinc-500">Currencies remain separate. No foreign-exchange conversion or combined revenue-to-cost ratio is inferred.</p><h3 className="mb-3 mt-6 text-sm font-medium">Referral entry paths</h3><Table rows={report.sources} columns={['source', 'requests', 'identified_actors']} /><h3 className="mb-3 mt-6 text-sm font-medium">Mobile attribution continuity</h3><Table rows={report.mobile.map(row => ({ ...row, method: label(String(row.method)), account_linked_installations: row.account_claimed }))} columns={['method', 'touches', 'installations', 'account_linked_installations']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Browser requests, code claims and native exchanges are different paths, not a sequential funnel. Installations here are distinct installation identifiers with recorded attribution touches, not verified downloads or a first-open recovery rate. These counts do not assign shared creator-link purchases to individual posts.</p></DataDetails>
    </Panel>
    <Panel title="App Store campaign cross-check" description="Imported aggregate campaign evidence for the selected calendar dates.">
      <p className="mb-4 text-sm leading-6 text-zinc-500">{report.store.length ? `${count(report.store.length)} imported campaign rows are available below.` : 'No imported App Store campaign rows are available for this period.'} Suppressed values remain unavailable; campaign totals do not identify individual customers or determine creator compensation.</p>
      <DataDetails><Table rows={report.store} columns={['handle', 'campaign', 'day', 'territory', 'downloads', 'sales', 'currency']} /><p className="mt-3 text-xs text-zinc-500">Up to 300 latest rows. These exports use calendar dates, so boundary days can extend beyond the rolling event window. Keep currency and territory scopes separate; aggregate and territory rows can overlap.</p></DataDetails>
    </Panel>
    <Panel title="Data sources and freshness" description="Snapshot time, credited monetary activity and compensation updates.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated', data.generatedAt], ['Latest attributed monetary event', coverage?.latest_revenue_event], ['Latest compensation update', coverage?.latest_compensation_update]].map(([title, value]) => <div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks every minute while visible and on return to this tab. Snapshots use a 60-second cache with background revalidation. No monetary activity timestamp means no matching ledger observation, not a failed refresh. Source times do not establish complete attribution. Known internal customer identities, bot-linked outcomes and explicit sandbox billing are excluded; legacy creator records without environment metadata retain the ledger’s production assumption.</p>
      <DataDetails><Table rows={[
        { metric: 'Latest attributed monetary record received', value: time(coverage?.latest_revenue_receipt) },
        { metric: 'Latest App Store campaign import', value: time(coverage?.latest_store_import) },
        { metric: 'Legacy monetary records using attribution-record time', value: coverage?.legacy_money_events ?? null },
        { metric: 'All-time paid USD records without payment dates', value: summary?.undated_paid ?? null },
        { metric: 'All-time active/paid compensation records in other currencies', value: summary?.other_currency_payments ?? null },
      ]} columns={['metric', 'value']} /></DataDetails>
      <Link className="mt-5 inline-block text-sm font-medium text-[#008ac5] underline underline-offset-4" href="/admin/program-settings">Manage assumptions and App Store imports →</Link>
    </Panel>
  </>
}
