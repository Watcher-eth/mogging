import { useState } from 'react'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, money } from './analytics-ui'

const trafficMetrics: ChartMetric[] = [{ key: 'visitors', label: 'Link visitors', color: chartColors.blue }, { key: 'clicks', label: 'Browser clicks', color: chartColors.violet }]
const trendMetrics: ChartMetric[] = [{ key: 'net', label: 'Net attributed revenue', color: chartColors.green }]
const time = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No observation available'
const milestoneNames: Record<string, string> = { install: 'Deferred attribution deliveries', signup: 'Signups', paywall_view: 'Paywall observations', checkout: 'Checkout observations', payment: 'Payment records (including zero-value trials)', refund: 'Refund records', dispute: 'Dispute records', claim: 'Attribution claims' }

export function CreatorAttributionOverview({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const [credit, setCredit] = useState('direct')
  const [creatorId, setCreatorId] = useState('all')
  const [selectedCurrency, setCurrency] = useState('USD')
  const [ranking, setRanking] = useState('visitors')
  const rankingKey = ranking === 'net' || ranking === 'paying_customers' ? ranking : 'visitors'
  const [chart, setChart] = useState('traffic')
  const report = data.creatorAttribution
  const creators = report?.creators ?? []
  const selectedCreator = creatorId === 'all' || creators.some(row => row.creator_id === creatorId) ? creatorId : 'all'
  const currencies = [...new Set((report?.summary ?? []).map(row => String(row.currency)))].sort((a, b) => a === b ? 0 : a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? 'USD'
  const matchCreator = (row: MetricRow) => selectedCreator === 'all' ? row.creator_id == null : row.creator_id === selectedCreator
  const summary = report?.summary.find(row => row.credit === credit && row.currency === currency && matchCreator(row))
  const traffic = report?.traffic.find(matchCreator)
  const coverage = report?.coverage[0]
  const financial = (value: unknown) => currency ? money(value, currency) : '—'
  const names = new Map(creators.map(row => [row.creator_id, String(row.creator)]))
  const ranked = creators.map(creator => {
    const revenue = report?.summary.find(row => row.creator_id === creator.creator_id && row.credit === credit && row.currency === currency)
    const clicks = report?.traffic.find(row => row.creator_id === creator.creator_id)
    return { creator_id: creator.creator_id, creator: String(creator.creator), visitors: Number(clicks?.visitors ?? 0), clicks: Number(clicks?.clicks ?? 0),
      net: Number(revenue?.net ?? 0), gross: Number(revenue?.gross ?? 0), reversals: Number(revenue?.reversals ?? 0),
      paying_customers: Number(revenue?.paying_customers ?? 0), payments: Number(revenue?.payments ?? 0) }
  }).filter(row => (selectedCreator === 'all' || row.creator_id === selectedCreator) && (ranking === 'visitors' ? row.clicks > 0 : row.payments > 0 || row.net !== 0 || row.reversals > 0)).sort((a, b) => b[rankingKey] - a[rankingKey])
  const daily = (report?.daily ?? []).filter(row => row.credit === credit && row.currency === currency && matchCreator(row))
  const trafficDaily = (report?.trafficDaily ?? []).filter(matchCreator)
  if (!report) return <Notice>Creator attribution could not be established from this snapshot. Missing data is not shown as zero.</Notice>
  return <>
    <div className="mb-6 flex flex-wrap gap-3">
      <AnalyticsSelect label="Creator" value={selectedCreator} onChange={setCreatorId} options={[{ value: 'all', label: 'All creators' }, ...creators.map(row => ({ value: String(row.creator_id), label: String(row.creator) }))]} />
      <AnalyticsSelect label="Credit model" value={credit} onChange={setCredit} options={[{ value: 'direct', label: 'Direct credit' }, { value: 'first', label: 'First-touch credit' }]} />
      {currencies.length ? <AnalyticsSelect label="Currency" value={currency} onChange={setCurrency} options={currencies.map(value => ({ value, label: value }))} /> : null}
    </div>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · All customer platforms · Pacific time · {credit === 'direct' ? 'Direct' : 'First-touch'} outcome credit · {currency || 'No monetary currency available'}</p>
    <p className="mb-5 text-sm leading-6 text-zinc-500">Direct and first-touch views describe overlapping credit for the same events. They must not be added together. Link traffic always follows the link visited.</p>
    <div className="admin-stats-grid">
      <Stat title="Creator link visitors" value={count(traffic?.visitors ?? 0)} note={`${count(traffic?.clicks ?? 0)} browser clicks · bots excluded · distinct identified browsers across the selected links`} />
      <Stat title="Attributed paying customers" value={count(summary?.paying_customers ?? 0)} note={`${currency || 'No currency'} · distinct recorded billing identities with a positive payment in the period`} />
      <Stat title="Net attributed revenue" value={financial(summary?.net ?? 0)} note={`${financial(summary?.gross ?? 0)} gross · ${financial(summary?.reversals ?? 0)} refunds and disputes · before fees and taxes`} />
      <Stat title="Creators driving traffic" value={count(traffic ? traffic.active_creators : 0)} note="Creators with non-bot browser clicks in the selected period" />
    </div>
    {!summary ? <p className="mb-5 text-sm leading-6 text-zinc-500">No monetary creator credit was recorded for this currency, period and credit model. Recorded attributed revenue is zero; this does not establish zero company revenue.</p> : null}
    <Panel title="Creator activity over time" description={chart === 'traffic' ? `${days === 1 ? 'Hourly' : 'Daily'} visitors and browser clicks · selected creator links` : `${days === 1 ? 'Hourly' : 'Daily'} net attributed revenue · ${currency} · ${credit === 'direct' ? 'direct' : 'first-touch'} credit`}
      action={<AnalyticsSelect label="Show" value={chart} onChange={setChart} options={[{ value: 'traffic', label: 'Link activity' }, { value: 'revenue', label: 'Net revenue' }]} />}
      note="Link activity comes from non-bot browser requests and is independent of the selected credit model and currency. Financial source: deduplicated creator attribution ledger. Payment/refund records linked to normalized billing use provider event time; legacy records use attribution-record time. This is recorded creator credit, not incremental revenue, profit, MRR or an attribution experiment. Renewals are revenue and do not imply a new customer. A paying identity is counted once across the selected creators in the headline; creator-level counts can overlap. Currencies are never combined. Missing time buckets are omitted, not proof of zero activity. Boundary buckets are partial. Unattributed or unrecorded billing is outside these credited totals.">
      <AnalyticsChart title="Creator activity over time" rows={chart === 'traffic' ? trafficDaily : daily} metrics={chart === 'traffic' ? trafficMetrics : trendMetrics} days={days} currency={chart === 'revenue' ? currency : undefined} fitToData />
      <DataDetails><Table rows={chart === 'traffic' ? trafficDaily : daily.map(row => ({ ...row, net: financial(row.net) }))} columns={chart === 'traffic' ? ['day', 'visitors', 'clicks'] : ['day', 'paying_customers', 'net']} /><p className="mt-3 text-xs text-zinc-500">Daily visitor and paying-customer counts may overlap and must not be added. Link visitors are distinct identified browsers within each bucket; requests without an identifier remain in clicks only.</p></DataDetails>
    </Panel>
    <Panel title="Contribution by creator" description={ranking === 'visitors' ? 'Selected period · non-bot browser activity across creator links' : `Selected period · ${currency} · ${credit === 'direct' ? 'direct' : 'first-touch'} credit`}
      action={<AnalyticsSelect label="Compare" value={ranking} onChange={setRanking} options={[{ value: 'visitors', label: 'Link visitors' }, { value: 'net', label: 'Net revenue' }, { value: 'paying_customers', label: 'Paying customers' }]} />}>
      <Bars animated labelWidth={180} rows={ranked.slice(0, 10).map(row => ({ label: names.get(row.creator_id) ?? 'Unlisted creator', value: Number(row[rankingKey]), detail: ranking === 'visitors' ? `${count(row.visitors)} identified browsers · ${count(row.clicks)} clicks` : `${count(row.paying_customers)} paying identities · ${count(row.payments)} positive payment records` }))} format={ranking === 'net' ? value => financial(value) : count} />
      <DataDetails><Table rows={ranked.map(row => ({ ...row, creator: names.get(row.creator_id) ?? 'Unlisted creator', gross: financial(row.gross), reversals: financial(row.reversals), net: financial(row.net) }))} columns={['creator', 'visitors', 'clicks', 'paying_customers', 'payments', 'gross', 'reversals', 'net']} /><p className="mt-3 text-xs text-zinc-500">Chart shows the top ten; the table retains every creator with observed events. Overall customer counts are calculated independently, not summed from rows.</p></DataDetails>
    </Panel>
    <Panel title="Account and attribution detail" description="Connected social accounts and supporting milestones.">
      <DataDetails>
        <h3 className="mb-3 text-sm font-medium">Revenue by social account</h3>
        <Table rows={report.accounts.filter(row => row.credit === credit && row.currency === currency && (selectedCreator === 'all' || row.creator_id === selectedCreator)).map(row => ({ ...row, creator: names.get(row.creator_id) ?? 'Unlisted creator', net: financial(row.net) }))} columns={['creator', 'platform', 'handle', 'paying_customers', 'net']} />
        <h3 className="mb-3 mt-6 text-sm font-medium">Attributed milestones · all currencies</h3>
        <p className="mb-3 text-xs leading-5 text-zinc-500">These are independent observations, not a sequential conversion funnel. Deferred deliveries are attribution handoffs, not verified downloads or all first app opens. Payment records include zero-value trials. Identity counts can overlap across milestones.</p>
        <Table rows={report.milestones.filter(row => row.credit === credit && matchCreator(row)).map(row => ({ ...row, milestone: milestoneNames[String(row.event)] ?? label(String(row.event)) }))} columns={['milestone', 'events', 'identities']} />
      </DataDetails>
    </Panel>
    <Panel title="Data sources and attribution coverage" description="Snapshot freshness and limits across all creators and currencies." note="Direct credit follows the recorded owning creator link; first-touch credit follows the stored original creator link. Current normalized billing allocation selects an eligible non-bot creator touch within 30 days before the initial purchase and freezes that allocation for related renewals and refunds. Legacy records can follow earlier capture rules. These are attribution rules, not proof that creator activity caused a purchase.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[
        ['Snapshot generated', data.generatedAt], ['Latest credited event', coverage?.latest_event], ['Latest attribution record received', coverage?.latest_receipt],
      ].map(([title, value]) => <div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Source: creator link requests, creator attribution events, connected social accounts and production billing records. Explicit sandbox events, known internal customers and bot-linked outcomes are excluded. Older records without environment metadata retain the ledger’s production assumption. Browser traffic has no environment flag; internal anonymous identities are excluded where linked.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Checks every minute while visible and on return to this tab. Snapshots use a 60-second cache with background revalidation. Fresh timestamps do not establish complete attribution.</p>
      <DataDetails><Table rows={[
        { metric: 'Latest eligible browser click', value: time(coverage?.latest_click) },
        { metric: 'Positive billing records without allocated creator credit', value: coverage?.unallocated_payments ?? null },
        { metric: 'Monetary billing events with unknown amounts', value: coverage?.missing_billing_amounts ?? null },
        { metric: 'Legacy monetary attribution records without normalized billing linkage', value: coverage?.legacy_money_events ?? null },
        { metric: 'Browser clicks without a visitor identifier (selected creator scope)', value: traffic?.unidentified_clicks ?? 0 },
      ]} columns={['metric', 'value']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Unallocated billing may reflect customers without an eligible creator touch, missing identity, or pending allocation; it is not a count of lost sales. Unknown amounts cannot be estimated. Legacy monetary records use attribution-record time. No click-to-payment rate is shown because these period totals do not share an entry cohort.</p></DataDetails>
    </Panel>
  </>
}
