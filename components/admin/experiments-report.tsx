import { useState } from 'react'
import { AnalyticsLink as Link } from './analytics-link'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { landingExperiments } from '@/lib/analytics/landing'
import { landingEventTime, landingExperimentRows, landingExperimentSummary } from '@/lib/admin/landing'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import { AnalyticsSelect } from './analytics-select'
import { AnalyticsChart, chartColors } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count } from './analytics-ui'

const timestamp = (value: string) => formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
const defaultTest = landingExperiments.find(experiment => experiment.status === 'active') ?? landingExperiments[0]

export function ExperimentsReport({ data }: { data: AnalyticsDashboard }) {
  const [selected, setSelected] = useState<string>(defaultTest.id)
  const experiment = landingExperiments.find(item => item.id === selected) ?? defaultTest
  const rows = landingExperimentRows(data.landingExperiments ?? [], experiment.id)
  const [control, treatment] = rows
  const summary = landingExperimentSummary(data.landingExperiments ?? [], experiment.id, new Date(data.generatedAt))
  const eligible = Number(control.mature) + Number(treatment.mature)
  const pending = Number(control.pending) + Number(treatment.pending)
  const comparable = rows.every(row => Number(row.mature) > 0)
  const days = Number(data.filters.days)
  const latest = rows.map(row => row.latest_exposure).filter((value): value is string => typeof value === 'string').sort((a, b) => landingEventTime(b) - landingEventTime(a))[0]
  const daily = (data.landingExperimentDaily ?? []).filter(row => row.experiment_id === experiment.id)
  const confidence = experiment.status === 'active' ? '95%' : '97.5%'
  const measurements = 'Each browser assignment is deduplicated in the selected period. Outcomes must follow exposure, match its experiment and variant, occur within seven days, and fall inside the selected period. Only browsers with a complete seven-day follow-up enter mature rates. Assignments with a recorded iPhone handoff are excluded from both rate numerators and denominators. App Store clicks exclude automatic iPhone redirects and handoff buttons. Cookies or devices changing can create another assignment. Missing events and blockers can affect results. Confidence intervals describe uncertainty; they do not give the probability a variant is the winner.'

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <AnalyticsSelect label="Test" value={experiment.id} onChange={setSelected} options={landingExperiments.map(item => ({ value: item.id, label: `${item.status === 'active' ? 'Active' : 'Archived'} · ${item.name}` }))} />
      <p className="text-xs text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · Website experiments · Pacific time</p>
    </div>
    <div className="mb-6">
      <p className="text-xs font-medium text-zinc-500">{experiment.status === 'active' ? 'Live test · 50/50 assignment' : 'Archived · historical results only'}</p>
      <h2 className="mt-2 text-xl font-medium tracking-tight">{experiment.name}</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">A: {experiment.control} · B: {experiment.treatment}</p>
      <p className="mt-2 text-sm font-medium">{summary.status}</p>
    </div>
    {days <= 7 ? <Notice>This period has no full seven-day follow-up for recent entrants. Choose Last 30 or 90 days to compare mature outcomes.</Notice> : null}
    {summary.imbalance ? <Notice>The recorded split is unexpectedly uneven. Investigate assignment and event delivery before interpreting results (allocation check: p &lt; 0.001).</Notice> : null}
    <div className="admin-stats-grid">
      <Stat title="A · App Store click rate" value={String(control.mature_store_rate)} note={`${count(control.mature_store_clicks)} clicks / ${count(control.mature)} eligible browsers · ${confidence} interval: ${control.interval}`} />
      <Stat title="B · App Store click rate" value={String(treatment.mature_store_rate)} note={`${count(treatment.mature_store_clicks)} clicks / ${count(treatment.mature)} eligible browsers · ${confidence} interval: ${treatment.interval}`} />
      <Stat title="Difference · B minus A" value={summary.difference} note="Percentage points · mature click rates; not a winner declaration" />
      <Stat title="Eligible browsers" value={count(eligible)} note={`${count(pending)} awaiting a full seven-day follow-up`} />
    </div>
    <Panel title="Primary outcome · App Store interest" description={`Mature App Store click rate · ${confidence} confidence intervals`} note={measurements}>
      {comparable ? <Bars maximum={100} format={value => `${value.toFixed(1)}%`} rows={rows.map((row, index) => ({ label: index === 0 ? 'A · Control' : 'B · Treatment', value: Number(row.mature_store_clicks) / Number(row.mature) * 100, detail: `${row.variant} · ${count(row.mature_store_clicks)} of ${count(row.mature)} eligible browsers · ${confidence} interval: ${row.interval}` }))} /> : <p className="admin-empty">Both variants need eligible browsers before a mature rate comparison is available. Pending visitors are not counted as failures.</p>}
      <p className="mt-4 text-sm leading-6 text-zinc-500">App Store clicks measure interest. They do not establish downloads, paying customers, or revenue.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Review checkpoints: at least {experiment.minimumDays} observed days and {count(experiment.minimumVisitors)} eligible browsers per variant. Currently {summary.elapsedDays} observed days · A {count(control.mature)} · B {count(treatment.mature)}. Reaching a checkpoint does not guarantee enough statistical power or a winner.</p>
      <DataDetails><Table rows={rows} columns={['variant', 'mature', 'mature_store_clicks', 'mature_store_rate', 'interval']} /><p className="mt-3 text-xs text-zinc-500">Relative lift of B vs A: {summary.lift}. Undefined when A has no mature clicks. Intervals use the existing Wilson method.</p></DataDetails>
    </Panel>
    <Panel title="Traffic allocation over time" description={`${summary.total ? count(summary.total) : 'No'} recorded browser assignments · A ${count(control.visitors)} / B ${count(treatment.visitors)}`} note="Each point groups a browser's first recorded entry for this experiment in the selected window by Pacific-time entry date. These are assignment counts, not conversions. Boundary buckets are partial; missing buckets are omitted. Counts describe the selected period rather than the entire experiment lifetime.">
      <AnalyticsChart title="Experiment traffic allocation" rows={daily} fitToData metrics={[
        { key: 'control', label: 'A · Control', color: chartColors.blue },
        { key: 'treatment', label: 'B · Treatment', color: chartColors.violet },
      ]} days={days} />
      <DataDetails><Table rows={daily} columns={['day', 'control', 'treatment']} /></DataDetails>
    </Panel>
    <Panel title="Secondary outcomes & diagnostics" description="Supporting evidence, separate from the primary test outcome.">
      <Disclosure className="admin-data-details"><DisclosureSummary>Explore downstream outcomes and exclusions</DisclosureSummary><AccordionContent>
        <p className="mt-4 text-xs leading-5 text-zinc-500">Observed counts for all assigned browsers, including recent entrants. Outcomes can overlap and are still developing; these are not mature conversion rates. Paid entries require a positive, server-confirmed paid checkout and are not payment transaction totals.</p>
        <Table rows={rows.map(row => ({ variant: row.variant, assignments: row.visitors, pending: row.pending, web_analysis_starts: row.browser_starts, paywalls: row.paywalls, entries_with_paid_checkout: row.paid_checkouts }))} columns={['variant', 'assignments', 'pending', 'web_analysis_starts', 'paywalls', 'entries_with_paid_checkout']} />
        <h3 className="mb-3 mt-6 text-sm font-medium">iPhone handoff context</h3>
        <p className="mb-3 text-xs leading-5 text-zinc-500">These shared handoffs happen before homepage treatment and are excluded from the primary click metric. Counts cover the selected period across tests; do not add them to variant conversions.</p>
        <Table rows={data.landingHandoffs ?? []} columns={['placement', 'destination', 'browsers']} />
        <p className="mt-4 text-xs text-zinc-500">Experiment ID: {experiment.id} · Assignment cookie lasts 90 days. Archived treatments retain their original definitions.</p>
      </AccordionContent></Disclosure>
    </Panel>
    <Panel title="Data sources & freshness" description="Experiment entry events and matched outcomes from the analytics database.">
      <dl className="grid gap-5 text-sm sm:grid-cols-2">
        <div><dt className="text-zinc-500">Snapshot generated</dt><dd className="mt-1 font-medium">{timestamp(data.generatedAt)}</dd></div>
        <div><dt className="text-zinc-500">Latest recorded entry · selected test</dt><dd className="mt-1 font-medium">{latest ? timestamp(latest) : 'No entries observed in this window'}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks every minute while visible and when you return to this tab. Server snapshots use a 60-second cache with background revalidation. Entry time is a client event timestamp, not ingestion time. Fresh snapshots do not establish complete tracking.</p>
      <Link className="mt-5 inline-block text-sm font-medium text-[#008ac5] underline underline-offset-4" href="/admin/analytics/quality">Data health →</Link>
    </Panel>
  </>
}
