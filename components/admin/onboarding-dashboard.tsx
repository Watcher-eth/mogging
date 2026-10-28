import { AnalyticsLink as Link } from './analytics-link'
import { useState } from 'react'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { onboardingScreenRows } from '@/lib/admin/chart-data'
import { onboardingStepProperties, supportedOnboardingVersions } from '@/lib/analytics/onboarding'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { EventReport } from './tracking-report'
import { Bars, ComparisonBars, DataDetails, Notice, Panel, Stat, Table, count, label, percent } from './analytics-ui'

const metrics: ChartMetric[] = [
  { key: 'started', label: 'Onboarding starts', color: chartColors.blue },
  { key: 'completed', label: 'Completed within 7 days', color: chartColors.green },
]
const keyStages = new Set(['primer', 'goals', 'upload', 'scan_preview', 'paywall_plans', 'evaluation_processing'])
const screenLabels: Record<string, string> = { upload: 'Photo capture', paywall_plans: 'Subscription plans', evaluation_processing: 'Report generation', commit: 'Commitment' }
const timestamp = (value: string) => formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
const linkClass = 'text-sm font-medium text-[#008ac5] underline underline-offset-4'

export function OnboardingDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const [screenView, setScreenView] = useState('key')
  const summary = data.onboardingSummary?.[0]
  const eligible = Number(summary?.eligible ?? 0)
  const started = Number(summary?.started ?? 0)
  const startEvents = Number(summary?.start_events ?? 0)
  const compatible = Number(summary?.compatible_start_events ?? 0)
  const screens: MetricRow[] = onboardingScreenRows(data.onboardingScreens ?? []).map(row => ({ ...row,
    screen: screenLabels[String(row.step)] ?? row.screen,
    status: Number(row.viewed) > 0 ? 'Recorded' : 'No observations',
    continuation: percent(Number(row.continued), Number(row.viewed)),
    drop_off: percent(Number(row.dropped), Number(row.mature)),
  }))
  const isCurrent = (row: MetricRow) => onboardingStepProperties(row.step as Parameters<typeof onboardingStepProperties>[0]).step_index >= 0
  const currentScreens = screens.filter(isCurrent)
  const legacyScreens = screens.filter(row => !isCurrent(row) && Number(row.viewed) > 0)
  const displayed = screenView === 'all' ? currentScreens : currentScreens.filter(row => keyStages.has(String(row.step)))
  const dropOff = currentScreens.filter(row => Number(row.mature) > 0)
    .sort((a, b) => Number(b.dropped) - Number(a.dropped) || Number(b.mature) - Number(a.mature)).slice(0, 8)
  const platform = data.filters.platform === 'all' ? 'iOS and Android' : data.filters.platform === 'ios' ? 'iOS' : data.filters.platform === 'android' ? 'Android' : 'Web'
  const detailHref = (page: string) => ({ pathname: `/admin/analytics/${page}`, query: { days: String(days), platform: data.filters.platform } })

  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · {platform} · Pacific time · Mobile onboarding flows</p>
    {data.filters.platform === 'web' ? <Notice>These onboarding cohorts cover the mobile app. Select iOS, Android or All platforms to review mobile onboarding performance.</Notice> : null}
    <div className="admin-stats-grid">
      <Stat title="Onboarding starts" value={count(summary?.started)} note="Distinct tracked flows with a start recorded in this period" />
      <Stat title="Completed onboarding" value={count(summary?.completed)} note="Initial report ready within seven days · client observed" />
      <Stat title="Completion rate" value={summary ? percent(Number(summary.eligible_completed), eligible) : '—'} note={eligible > 0 ? `${count(summary?.eligible_completed)} of ${count(eligible)} flows with a full seven-day follow-up` : 'Available after a full seven-day follow-up'} />
      <Stat title="Recent onboarding flows" value={count(summary?.pending)} note="Less than seven days of follow-up; excluded from the rate" />
    </div>
    {summary && !started && data.filters.platform !== 'web' ? <Notice>No compatible onboarding starts were recorded in this period. Screen observations and older tracking remain available below; missing data does not establish zero usage.</Notice> : null}
    {days <= 7 ? <p className="mb-5 text-xs leading-5 text-zinc-500">Use Last 30 or 90 days to assess completion and screen drop-off after the full follow-up period.</p> : null}

    <Panel title="Onboarding performance" description={`${days === 1 ? 'Hourly' : 'Daily'} onboarding starts and first-report completions by start date`} action={<Link href={detailHref('purchases')} className={linkClass}>Purchase flow →</Link>}
      note={`Source: client onboarding start and completion events with a device and flow identifier, using supported tracking versions ${supportedOnboardingVersions.join(', ')}. Each device–flow pair enters once at its first start observed in the selected period. Completion must follow that start in the same flow, within seven days and before the snapshot cutoff. The app emits completion when its initial report is ready; this is a client observation, not independent billing or backend verification. Repeat starts do not create another flow. Recent completed flows appear in counts but remain excluded from the mature completion rate. Known internal, sandbox and creator/admin activity is excluded; older unclassified runtime evidence remains included.`}>
      <AnalyticsChart title="Onboarding performance" days={days} rows={data.onboardingDaily ?? []} metrics={metrics} />
      <p className="mt-4 text-xs leading-5 text-zinc-500">Completion is reported by the app when the initial report is ready. Results are grouped by the date the flow started, and recent flows can still complete. Daily counts are not a same-day conversion rate; boundary buckets are partial.</p>
      <DataDetails><Table rows={data.onboardingDaily ?? []} columns={['day', 'started', 'completed']} /></DataDetails>
    </Panel>

    <Panel title="Screen progression" description="Observed reach and continuation across the current onboarding screens." action={<AnalyticsSelect label="Screens" value={screenView} onChange={setScreenView} options={[{ value: 'key', label: 'Key stages' }, { value: 'all', label: 'All current screens' }]} />}
      note="Each screen counts the first view per device and flow. Continuation means reaching a later screen or completing an evaluation within seven days. Screens are independent cohorts, not a single joined funnel. Optional screens count only the flows that see them. Recent unresolved views remain pending; skipped screens are not automatically counted as drop-off. Current screen definitions are shown here; observations from legacy screens remain in diagnostics.">
      <ComparisonBars series={[{ label: 'Flows reaching screen', color: chartColors.blue }, { label: 'Flows continuing', color: chartColors.green }]} rows={displayed.map(row => ({ label: String(row.screen), values: [Number(row.viewed), Number(row.continued)], detail: Number(row.viewed) > 0 ? `${count(row.continued)} continued · ${count(row.pending)} pending follow-up` : 'No compatible screen observations' }))} />
      <DataDetails><Table rows={currentScreens} columns={['screen', 'status', 'viewed', 'continued', 'pending', 'mature', 'dropped', 'drop_off']} /></DataDetails>
    </Panel>

    <Panel title="Screen drop-off" description="Screens with the largest number of flows that did not advance within seven days."
      note="Only screen views with a complete seven-day follow-up enter the denominator. Drop-off means no later screen or evaluation completion was observed within that window; it does not establish why a person stopped. Screens are ranked by the number of dropped flows, then eligible sample size, rather than by percentage alone. A flow can appear on more than one screen; these counts must not be added together. Current and legacy screen groups remain separate.">
      {dropOff.length ? <Bars maximum={100} format={value => `${value.toFixed(1)}%`} rows={dropOff.map(row => ({ label: String(row.screen), value: Number(row.dropped) / Number(row.mature) * 100, detail: `${count(row.dropped)} of ${count(row.mature)} eligible screen views · ${count(row.pending)} pending` }))} /> : <p className="admin-empty">No current-screen cohorts have a full seven-day follow-up in this window. Drop-off rates are not yet available.</p>}
      <DataDetails><Table rows={dropOff} columns={['screen', 'mature', 'dropped', 'drop_off', 'pending']} /></DataDetails>
    </Panel>

    <Panel title="Data coverage and methodology" description="Reporting scope, observation times and supporting diagnostics.">
      <dl className="grid gap-5 text-sm sm:grid-cols-2">
        <div><dt className="text-zinc-500">Snapshot generated</dt><dd className="mt-1 font-medium">{timestamp(data.generatedAt)}</dd></div>
        <div><dt className="text-zinc-500">Latest recorded start or completion</dt><dd className="mt-1 font-medium">{typeof summary?.latest_event === 'string' ? timestamp(summary.latest_event) : 'No compatible milestones in this window'}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">{summary ? `${count(compatible)} of ${count(startEvents)} recorded mobile start events have compatible flow tracking. ` : 'Cohort coverage is unavailable. '}Starts without compatible identifiers are excluded from the completion cohort. Flows are not unique people. Completion tracking needs the start and outcome inside the selected period.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Checks for updates every minute while visible and when returning to this tab. Snapshots use a 60-second cache with background revalidation; Refresh may return the previous snapshot while a new one is prepared. Milestone times come from client events and do not establish ingestion completeness.</p>
      <Disclosure className="admin-data-details"><DisclosureSummary>View tracking coverage and diagnostic details</DisclosureSummary><AccordionContent>
        <h3 className="mb-3 mt-6 text-sm font-medium">Tracking version coverage</h3>
        <Table rows={data.onboardingRevisions ?? []} columns={['revision', 'views', 'devices', 'coverage']} />
        {legacyScreens.length ? <><h3 className="mb-3 mt-6 text-sm font-medium">Legacy screen observations</h3><Table rows={legacyScreens} columns={['screen', 'viewed', 'continued', 'mature', 'dropped', 'drop_off']} /></> : null}
        <h3 className="mb-3 mt-6 text-sm font-medium">Recorded interruptions</h3>
        <p className="mb-3 text-xs leading-5 text-zinc-500">Permission declines, cancellations and safe error codes are supporting signals; they do not establish the cause of drop-off.</p>
        <Table rows={(data.onboardingFriction ?? []).map(row => ({ ...row, event: label(String(row.event)), reason: label(String(row.reason)) }))} columns={['screen', 'event', 'reason', 'affected_devices', 'events']} />
        <h3 className="mb-3 mt-6 text-sm font-medium">Activation milestones</h3>
        <p className="mb-3 text-xs leading-5 text-zinc-500">Separate ordered mobile-device journey across all tracking versions. Each milestone follows the previous within seven days, with all events inside this period. Client purchase completion is not verified revenue.</p>
        <Bars rows={(data.onboarding ?? []).map((row, index) => ({ label: ['Onboarding started', 'Paywall reached', 'Purchase observed', 'Scan completed', 'Report viewed'][index] ?? label(row.name), value: row.actors }))} />
        <h3 className="mb-3 mt-6 text-sm font-medium">Additional screen activity</h3>
        <Table rows={data.steps ?? []} columns={['step', 'viewed', 'completed', 'skipped', 'back_actions']} />
        <Table rows={data.screens ?? []} columns={['screen', 'exits', 'median_ms', 'p90_ms']} />
        <EventReport data={data} section="Onboarding" />
      </AccordionContent></Disclosure>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3"><Link href={detailHref('scans')} className={linkClass}>Scan performance →</Link><Link href={detailHref('quality')} className={linkClass}>Data health →</Link></div>
    </Panel>
  </>
}
