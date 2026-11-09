import { useState } from 'react'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { landingExperiments } from '@/lib/analytics/landing'
import { landingEventTime, landingExperimentRows, landingExperimentSummary, landingRateInterval } from '@/lib/admin/landing'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsSelect } from './analytics-select'
import { AnalyticsChart, chartColors } from './analytics-chart'
import { ComparisonBars, DataDetails, Notice, Panel, Stat, Table, analyticsChannelLabel, count, percent } from './analytics-ui'

const webTest = 'web-analysis'
const paywallTest = 'web-paywall'
const defaultTest = landingExperiments[0]
const options = [
  { value: defaultTest.id, label: 'Homepage · Old vs new' },
  { value: paywallTest, label: 'Web paywall · A/B tests' },
  { value: webTest, label: 'Web analysis · Old vs new' },
  ...landingExperiments.slice(1).map(item => ({ value: item.id, label: 'Archived · ' + item.name })),
]

export function ExperimentsReport({ data }: { data: AnalyticsDashboard }) {
  const [selected, setSelected] = useState<string>((data.paywallExperiments?.length ?? 0) > 0 ? paywallTest : defaultTest.id)
  const experiment = landingExperiments.find(item => item.id === selected) ?? defaultTest
  return <>
    <div className="mb-5"><AnalyticsSelect label="Experiment" value={selected} onChange={setSelected} options={options} /></div>
    <div key={selected} className="admin-report-enter">
      {selected === paywallTest ? <PaywallExperiments data={data} /> : selected === webTest ? <WebAnalysisComparison data={data} /> : <HomepageExperiment data={data} experiment={experiment} />}
    </div>
  </>
}

function HomepageExperiment({ data, experiment }: { data: AnalyticsDashboard; experiment: typeof landingExperiments[number] }) {
  const rows = landingExperimentRows(data.landingExperiments ?? [], experiment.id)
  const summary = landingExperimentSummary(data.landingExperiments ?? [], experiment.id, new Date(data.generatedAt))
  const latest = Math.max(...rows.map(row => landingEventTime(row.latest_exposure)).filter(Number.isFinite))
  const outcome = experiment.status === 'active' ? 'Paid conversion' : 'App Store click rate'
  const labels = [experiment.control, experiment.treatment]
  return <>
    <div className="admin-stats-grid">
      {rows.map((row, index) => <Stat key={row.variant} title={labels[index]} value={String(row.mature_conversion_rate)}
        note={`${count(row.mature_conversions)} conversions / ${count(row.mature)} eligible browsers · ${outcome}`} />)}
      <Stat title="Change" value={summary.difference} note={summary.status} />
    </div>
    {summary.imbalance && <Notice>The recorded allocation is unexpectedly uneven. Check exposure delivery before interpreting the result.</Notice>}
    <Panel title="Homepage exposure over time"
      description={`${count(summary.total)} assigned browsers · ${Number.isFinite(latest) ? 'Latest exposure ' + formatReportingTime(new Date(latest), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No observed exposures in this period'}`}
      note="The live comparison counts browsers that reached an actual homepage, excluding automatic handoffs. Paid conversion uses verified positive Stripe payments within seven days. Recent browsers appear as pending until they have seven days of follow-up. Native purchases cannot be matched reliably to a homepage assignment.">
      <AnalyticsChart title="Homepage assignments" rows={(data.landingExperimentDaily ?? []).filter(row => row.experiment_id === experiment.id)} fitToData days={Number(data.filters.days)}
        metrics={[{ key: 'control', label: labels[0], color: chartColors.blue }, { key: 'treatment', label: labels[1], color: chartColors.violet }]} />
      <DataDetails><Table rows={rows} columns={['variant', 'visitors', 'mature', 'pending', 'mature_conversions', 'mature_conversion_rate', 'interval', 'paywalls', 'checkouts', 'subscription_buyers']} /></DataDetails>
    </Panel>
  </>
}

const analysisStages = [
  ['started', 'Opened analysis'], ['capture_opened', 'Reached capture'], ['photo_ready', 'Photo ready'], ['paywalls', 'Reached paywall'],
] as const
function WebAnalysisComparison({ data }: { data: AnalyticsDashboard }) {
  const observed = data.webJourney?.experiments ?? []
  return <>
    <Notice>This compares tracked rollout cohorts. Traffic, offers and tracking coverage can differ by version. Journeys without a known version are excluded. Checkout and paid rates require a full 24 hours of follow-up.</Notice>
    {['mobile_web', 'desktop_web'].map(channel => {
      const rows: MetricRow[] = ['old', 'new'].map(variant => observed.find(row => row.channel === channel && row.variant === variant) ?? { variant, started: null, mature: null, paid: null, subscribed: null, checkouts: null })
      return <Panel key={channel} title={analyticsChannelLabel(channel)} description="First 24 hours after entering analysis. Capture and paywall counts include recent journeys.">
        {rows.some(row => row.started != null) && <ComparisonBars rows={analysisStages.map(([key, label]) => ({ label, values: rows.map(row => row[key] == null ? null : Number(row[key])) }))}
          series={[{ label: 'Old flow', color: chartColors.blue }, { label: 'New flow', color: chartColors.violet }]} />}
        <Table rows={rows.map(row => ({ ...row, checkout_rate: percent(Number(row.checkouts), Number(row.mature)), paid_rate: percent(Number(row.paid), Number(row.mature)) }))}
          columns={['variant', 'started', 'mature', 'checkouts', 'checkout_rate', 'paid', 'paid_rate', 'subscribed']} />
      </Panel>
    })}
  </>
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const metric = (row: MetricRow, key: string) => Number(row[key] ?? 0)

function PaywallExperiments({ data }: { data: AnalyticsDashboard }) {
  const results = data.paywallExperiments ?? []
  const groups = new Map<string, MetricRow[]>()
  for (const row of results) {
    const key = `${row.experiment_id} · ${row.surface}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  if (!groups.size) return <Notice>No paywall experiments have recorded an exposure in this date range.</Notice>
  return <>
    <Notice>One exposure per browser and device category. Paid results use Stripe-confirmed subscription starts within 24 hours of the first plan impression. Use the full enrollment date range for decisions.</Notice>
    {[...groups].map(([key, rows]) => <PaywallExperiment key={key} name={key} rows={rows} now={Date.parse(data.generatedAt)} />)}
  </>
}

function PaywallExperiment({ name, rows, now }: { name: string; rows: MetricRow[]; now: number }) {
  const [control, treatment] = ['control', 'treatment'].map(arm => rows.find(row => row.arm === arm && row.browser === 'all') ?? { arm })
  const sample = [control, treatment]
  const exposed = sample.map(row => metric(row, 'exposed'))
  const total = exposed[0] + exposed[1]
  const allocationMismatch = total >= 100 && (exposed[0] - exposed[1]) ** 2 / total > 10.827566171
  const end = Math.max(...sample.map(row => metric(row, 'ends_at')))
  const minimum = Math.max(...sample.map(row => metric(row, 'minimum_per_arm')))
  const mature = sample.map(row => metric(row, 'mature'))
  const paid = sample.map(row => metric(row, 'paid'))
  const ready = now >= end + 86_400_000 && mature.every(n => n >= minimum)
  const intervals = paid.map((n, index) => landingRateInterval(n, mature[index], 1.959963985))
  const rates = paid.map((n, index) => mature[index] ? n * 100 / mature[index] : null)
  const [a, b] = rates
  const [aInterval, bInterval] = intervals
  const difference = a !== null && b !== null ? b - a : null
  // Newcombe's interval combines the two Wilson intervals without pooling the arms.
  const differenceInterval = a !== null && b !== null && difference !== null && aInterval && bInterval ? [
    difference - Math.hypot(b - bInterval[0], aInterval[1] - a),
    difference + Math.hypot(bInterval[1] - b, a - aInterval[0]),
  ] : null
  let status = 'Enrollment open'
  if (allocationMismatch) status = 'Check allocation before interpreting'
  else if (now >= end && now < end + 86_400_000) status = 'Waiting for 24-hour outcomes'
  else if (now >= end && !ready) status = 'Inconclusive · too few exposures'
  else if (ready) status = 'Ready to review · check uncertainty and guardrails'
  const tableRow = (row: MetricRow) => {
    const n = metric(row, 'mature')
    const buyers = metric(row, 'paid')
    return {
      browser: row.browser ?? 'all', arm: row.arm, exposed: metric(row, 'exposed'), pending: metric(row, 'exposed') - n,
      tapped: metric(row, 'tapped'), checkouts: metric(row, 'checkouts'), checkout_failures: metric(row, 'checkout_failures'),
      paid: buyers, paid_rate: percent(buyers, n),
      first_charge_per_exposure: n && buyers === metric(row, 'paid_usd') ? usd.format(metric(row, 'first_charge_usd_cents') / (n * 100)) : '—',
    }
  }
  const columns = ['arm', 'exposed', 'pending', 'tapped', 'checkouts', 'checkout_failures', 'paid', 'paid_rate', 'first_charge_per_exposure']
  return <Panel title={name} description={`${rows[0].kind === 'price' ? 'Price' : 'Length'} test · ${status} · ${count(minimum)} mature exposures per arm required · Enrollment ends ${formatReportingTime(new Date(end), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`}
    note="First-charge revenue is gross USD before refunds and fees. It is hidden when paid outcomes use another currency. Browser breakdowns diagnose friction and are exploratory.">
    <div className="admin-stats-grid">
      {sample.map((row, index) => {
        const interval = intervals[index]
        return <Stat key={String(row.arm)} title={index === 0 ? 'Current paywall' : 'Variant'} value={percent(paid[index], mature[index])}
          note={`${count(paid[index])} paid / ${count(mature[index])} mature${interval ? ` · 95% CI ${interval[0].toFixed(1)}–${interval[1].toFixed(1)}%` : ''}`} />
      })}
      <Stat title="Change" value={difference !== null ? `${difference.toFixed(2)} pp` : '—'}
        note={ready && !allocationMismatch && differenceInterval
          ? `95% CI ${differenceInterval[0].toFixed(2)} to ${differenceInterval[1].toFixed(2)} pp`
          : 'Variant minus current paywall'} />
    </div>
    <Table rows={sample.map(tableRow)} columns={columns} />
    <DataDetails><Table rows={rows.filter(row => row.browser !== 'all').map(tableRow)} columns={['browser', ...columns]} /></DataDetails>
  </Panel>
}
