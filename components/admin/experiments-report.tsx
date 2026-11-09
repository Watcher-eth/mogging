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
const onboardingTest = 'web-onboarding'
const defaultTest = landingExperiments[0]
const options = [
  { value: defaultTest.id, label: 'Mobile homepage · Old vs new' },
  { value: onboardingTest, label: 'Web onboarding · Full vs short' },
  { value: paywallTest, label: 'Web paywall · A/B tests' },
  { value: webTest, label: 'Web analysis · Old vs new' },
  ...landingExperiments.slice(1).map(item => ({ value: item.id, label: 'Archived · ' + item.name })),
]

export function ExperimentsReport({ data }: { data: AnalyticsDashboard }) {
  const initial = data.paywallExperiments?.some(row => row.kind === 'onboarding') ? onboardingTest
    : data.paywallExperiments?.length ? paywallTest : defaultTest.id
  const [selected, setSelected] = useState<string>()
  const current = selected ?? initial
  const experiment = landingExperiments.find(item => item.id === current) ?? defaultTest
  return <>
    <div className="mb-5"><AnalyticsSelect label="Experiment" value={current} onChange={setSelected} options={options} /></div>
    <div key={current} className="admin-report-enter">
      {current === onboardingTest || current === paywallTest ? <PaywallExperiments data={data} onboarding={current === onboardingTest} /> : current === webTest ? <WebAnalysisComparison data={data} /> : <HomepageExperiment data={data} experiment={experiment} />}
    </div>
  </>
}

function HomepageExperiment({ data, experiment }: { data: AnalyticsDashboard; experiment: typeof landingExperiments[number] }) {
  const rows = landingExperimentRows(data.landingExperiments ?? [], experiment.id)
  const summary = landingExperimentSummary(data.landingExperiments ?? [], experiment.id, new Date(data.generatedAt))
  const latest = Math.max(...rows.map(row => landingEventTime(row.latest_exposure)).filter(Number.isFinite))
  const outcome = Number(experiment.version) >= 3 ? 'Paid conversion' : 'App Store click rate'
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
      note={experiment.status === 'active' ? "English mobile homepage traffic is split 30% old and 70% new. Paid conversion uses verified Stripe payments within seven days. Recent browsers are pending until they have seven days of follow-up." : "Archived experiment results use the original conversion metric and a seven-day follow-up window."}>
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

function PaywallExperiments({ data, onboarding }: { data: AnalyticsDashboard; onboarding: boolean }) {
  const results = (data.paywallExperiments ?? []).filter(row => (row.kind === 'onboarding') === onboarding)
  const groups = new Map<string, MetricRow[]>()
  for (const row of results) {
    const key = `${row.experiment_id} · ${row.surface}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  if (!groups.size) return <Notice>{onboarding ? 'Waiting for the first onboarding assignments in this date range.' : 'No paywall experiments recorded an exposure in this date range.'}</Notice>
  return <>
    <Notice>{onboarding ? 'Mobile and desktop each split eligible browsers 50/50. Outcomes use the first 24 hours after onboarding entry. Use the full enrollment date range for decisions.'
      : 'One exposure per browser and device category. Paid results use Stripe-confirmed subscription starts within 24 hours of seeing the first plan. Use the full enrollment date range for decisions.'}</Notice>
    {[...groups].map(([key, rows]) => <PaywallExperiment key={key} name={key} rows={rows} now={Date.parse(data.generatedAt)}
      daily={(data.onboardingExperimentDaily ?? []).filter(row => row.experiment_id === rows[0].experiment_id && row.surface === rows[0].surface)} />)}
  </>
}

const onboardingSeries = [
  { label: 'Full onboarding', color: chartColors.blue },
  { label: 'Short onboarding', color: chartColors.violet },
]
const onboardingStages = [
  ['photo_ready', 'Photos ready'], ['paywall_reached', 'Paywall reached'], ['checkouts', 'Checkout started'],
] as const
const percentage = (value: number) => `${value.toFixed(1)}%`

function PaywallExperiment({ name, rows, now, daily }: { name: string; rows: MetricRow[]; now: number; daily: MetricRow[] }) {
  const onboarding = rows[0].kind === 'onboarding'
  const testLabel = onboarding ? 'Onboarding' : rows[0].kind === 'price' ? 'Price' : 'Paywall length'
  const [control, treatment] = ['control', 'treatment'].map(arm => rows.find(row => row.arm === arm && row.browser === 'all') ?? { arm })
  const sample = [control, treatment]
  const exposed = sample.map(row => metric(row, 'exposed'))
  const total = exposed[0] + exposed[1]
  const allocationMismatch = total >= 100 && (exposed[0] - exposed[1]) ** 2 / total > 10.827566171
  const end = Math.max(...sample.map(row => metric(row, 'ends_at')))
  const minimum = Math.max(...sample.map(row => metric(row, 'minimum_per_arm')))
  const mature = sample.map(row => metric(row, 'mature'))
  const paid = sample.map(row => metric(row, 'paid'))
  const revenue = sample.map((row, index) => mature[index] && paid[index] === metric(row, 'paid_usd')
    ? metric(row, 'first_charge_usd_cents') / (mature[index] * 100) : null)
  const device = rows[0].surface === 'mobile' ? 'Mobile web' : 'Desktop web'
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
      photo_ready: metric(row, 'photo_ready'), paywall_reached: metric(row, 'paywall_reached'),
      tapped: metric(row, 'tapped'), checkouts: metric(row, 'checkouts'), checkout_failures: metric(row, 'checkout_failures'),
      paid: buyers, observed_paid: metric(row, 'observed_paid'), paid_rate: percent(buyers, n),
      first_charge_per_exposure: n && buyers === metric(row, 'paid_usd') ? usd.format(metric(row, 'first_charge_usd_cents') / (n * 100)) : '—',
    }
  }
  const columns = ['arm', 'exposed', 'pending', ...(onboarding ? ['photo_ready', 'paywall_reached'] : []), 'tapped', 'checkouts', 'checkout_failures', 'observed_paid', 'paid', 'paid_rate', 'first_charge_per_exposure']
  return <Panel title={onboarding ? `${device} · Full vs short` : name} description={`${testLabel} test · ${status} · ${count(minimum)} mature exposures per arm required · Enrollment ends ${formatReportingTime(new Date(end), { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`}
    note="First-charge revenue is gross USD before refunds and fees. It is hidden when paid outcomes use another currency. Browser breakdowns diagnose friction and are exploratory.">
    {onboarding && <div className="mb-5 text-sm leading-6 text-[#73777d]">
      {rows[0].surface === 'mobile'
        ? 'Short skips obstacles, experience, methods and time commitment.'
        : 'Short skips ethnicity and combines photo consent with the scan action.'}
    </div>}
    <div className="admin-stats-grid">
      {sample.map((row, index) => {
        const interval = intervals[index]
        return <Stat key={String(row.arm)} title={onboarding ? index === 0 ? 'Full onboarding' : 'Short onboarding' : index === 0 ? 'Current paywall' : 'Variant'} value={percent(paid[index], mature[index])}
          note={`${count(paid[index])} paid / ${count(mature[index])} mature${interval ? ` · 95% CI ${interval[0].toFixed(1)}–${interval[1].toFixed(1)}%` : ''}`} />
      })}
      <Stat title="Change" value={difference !== null ? `${difference.toFixed(2)} pp` : '—'}
        note={ready && !allocationMismatch && differenceInterval
          ? `95% CI ${differenceInterval[0].toFixed(2)} to ${differenceInterval[1].toFixed(2)} pp`
          : 'Treatment minus control'} />
    </div>
    {onboarding && <>
      <div className="my-6">
        <h3 className="text-sm font-medium">Assignments by day</h3>
        <p className="mb-2 text-xs text-[#73777d]">All entrants, including those still in their first 24 hours.</p>
        <ComparisonBars series={onboardingSeries} rows={daily.map(row => ({
          label: formatReportingTime(String(row.day), { month: 'short', day: 'numeric' }),
          values: [metric(row, 'control'), metric(row, 'treatment')],
        }))} />
      </div>
      <div className="my-6">
        <h3 className="text-sm font-medium">Funnel reach</h3>
        <p className="mb-2 text-xs text-[#73777d]">Share of each variant’s entrants with a full 24 hours of follow-up.</p>
        {mature.some(Boolean) ? <ComparisonBars series={onboardingSeries} maximum={100} format={percentage} rows={onboardingStages.map(([key, label]) => ({
          label, values: sample.map((row, index) => mature[index] ? metric(row, key) * 100 / mature[index] : null),
        }))} /> : <p className="admin-empty">Funnel comparisons appear after the first 24 hours of follow-up.</p>}
      </div>
      {revenue.some(value => value !== null) && <div className="my-6">
        <h3 className="text-sm font-medium">First-payment revenue per entrant</h3>
        <ComparisonBars series={onboardingSeries} format={value => usd.format(value)} rows={[{ label: 'USD per entrant', values: revenue }]} />
      </div>}
    </>}
    <Table rows={sample.map(tableRow)} columns={columns} />
    <DataDetails><Table rows={rows.filter(row => row.browser !== 'all').map(tableRow)} columns={['browser', ...columns]} /></DataDetails>
  </Panel>
}
