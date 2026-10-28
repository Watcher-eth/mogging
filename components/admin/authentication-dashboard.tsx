import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, percent } from './analytics-ui'

const metrics: ChartMetric[] = [
  { key: 'auth_starts', label: 'Sign-in starts', color: chartColors.blue },
  { key: 'auth_successes', label: 'Successful sign-ins', color: chartColors.green },
  { key: 'auth_failures', label: 'Sign-in errors', color: chartColors.orange },
]
const names: Record<string, string> = {
  apple: 'Apple', google: 'Google', password: 'Password', unknown: 'Not recorded',
  provider: 'Identity provider', session_exchange: 'Session exchange', session_storage: 'Session storage', post_login: 'Account setup', unclassified: 'Not classified',
  account_auth_failed: 'Sign-in error', account_post_login_failed: 'Account setup error',
  guest_session_ready: 'Guest sessions ready', guest_purchase_recovered: 'Guest purchases recovered', guest_account_saved: 'Guest accounts saved',
  guest_save_prompt_viewed: 'Account save prompts viewed', guest_recovery_bound: 'Recovery credentials saved', guest_recovery_binding_failed: 'Recovery credential errors',
  guest_save_prompt_dismissed: 'Account save prompts dismissed', guest_save_signin_started: 'Sign-ins from account save prompts', guest_account_save_failed: 'Account save errors',
  guest_recovery_started: 'Guest recovery starts', guest_recovery_completed: 'Guest recoveries completed', guest_recovery_failed: 'Guest recovery errors',
  reports_sync_completed: 'Report synchronizations completed', reports_sync_failed: 'Report synchronization errors',
}
const name = (value: unknown) => names[String(value)] ?? label(String(value))
const time = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No observation available'

export function AuthenticationDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const report = data.authentication
  if (!report) return <Notice>Authentication data could not be established from this snapshot. Unavailable data is not shown as zero.</Notice>
  const summary = report.summary[0]
  const links = report.links[0]
  const issueGroups = new Map<string, { label: string; value: number }>()
  for (const row of report.failures) {
    const key = `${row.provider}:${row.stage}`
    const group = issueGroups.get(key) ?? { label: `${name(row.provider)} · ${name(row.stage)}`, value: 0 }
    group.value += Number(row.events)
    issueGroups.set(key, group)
  }
  const chartMetrics = metrics.filter(metric => data.daily.some(row => Number(row[metric.key]) > 0))
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · {data.filters.platform === 'all' ? 'All platforms' : data.filters.platform === 'ios' ? 'iOS' : name(data.filters.platform)} · Production customer activity · Pacific time</p>
    <div className="admin-stats-grid">
      <Stat title="Sign-in starts" value={count(summary?.starts)} note="Recorded attempts to sign in · includes repeat attempts" />
      <Stat title="Successful sign-ins" value={count(summary?.successes)} note={`${count(summary?.authenticated_devices)} distinct devices or browsers · session saved on current releases`} />
      <Stat title="Sign-in errors" value={count(summary?.failures)} note="Recorded authentication errors · cancellations shown separately" />
      <Stat title="Account setup errors" value={count(summary?.setup_failures)} note="Errors after authentication · separate from sign-in errors" />
    </div>
    <p className="mb-5 text-sm leading-6 text-zinc-500">{count(summary?.cancellations)} sign-in cancellations recorded. Counts describe observed activity, not new customers. Starts and outcomes are counted independently; they may fall in different periods and are not a conversion funnel.</p>
    <Panel title="Sign-in activity" description={`${days === 1 ? 'Hourly' : 'Daily'} recorded starts, successful sign-ins and errors`}
      note="Source: client authentication events. Counts include repeat attempts, not unique customers. Empty time buckets are omitted; a gap does not establish zero usage or a service outage. Boundary buckets are partial. Only series with recorded activity are displayed. Current releases emit success after session storage; older releases may use different success timing and combine cancellations or setup errors with sign-in failures. Historical events retain their original classification.">
      {chartMetrics.length ? <AnalyticsChart key={`${days}:${data.filters.platform}`} title="Sign-in activity" rows={data.daily} metrics={chartMetrics} days={days} /> : <p className="admin-empty">No sign-in starts, successes or errors were recorded in this period.</p>}
      <DataDetails><Table rows={data.daily.filter(row => ['auth_starts','auth_successes','auth_failures','auth_cancellations','post_login_failures'].some(key => Number(row[key]) > 0)).map(row => ({ period: time(row.day), sign_in_starts: row.auth_starts, successful_sign_ins: row.auth_successes, sign_in_errors: row.auth_failures, cancellations: row.auth_cancellations, account_setup_errors: row.post_login_failures }))} columns={['period','sign_in_starts','successful_sign_ins','sign_in_errors','cancellations','account_setup_errors']} /></DataDetails>
    </Panel>
    <Panel title="Sign-in providers" description="Recorded outcomes by sign-in method. Repeated attempts are included."
      note="Provider totals are independent event counts, not matched attempts or provider success rates. Missing provider metadata remains visible. Successful sign-ins do not establish successful account setup, report synchronization or purchase recovery.">
      <Table rows={report.providers.map(row => ({ provider: name(row.provider), starts: row.starts, successful_sign_ins: row.successes, sign_in_errors: row.failures, cancellations: row.cancellations, account_setup_errors: row.setup_failures }))} columns={['provider','starts','successful_sign_ins','sign_in_errors','cancellations','account_setup_errors']} />
    </Panel>
    <Panel title="Authentication issues" description="Sign-in and account setup errors by provider, stage and reported reason."
      note="Cancellations are excluded. Bars group errors by provider and stage; underlying data retains every reported reason. Device counts are deduplicated within each group and can overlap. Reasons are sanitized tracking codes, not customer messages. Older events may lack a stage or reason; unclassified errors are retained.">
      <Bars animated labelWidth={210} rows={[...issueGroups.values()].sort((a, b) => b.value - a.value)} />
      <DataDetails><Table rows={report.failures.map(row => ({ ...row, outcome: name(row.outcome), provider: name(row.provider), stage: name(row.stage), reason: name(row.reason) }))} columns={['outcome','provider','stage','reason','events','affected_devices']} /></DataDetails>
    </Panel>
    <Panel title="Account continuity" description="Verified identity links, guest recovery and report synchronization."
      note="Identity links come from stored account-to-anonymous-identity records, filtered by linked-at date and selected platform. Distinct accounts are counted independently across the full scope; link counts are not new-account or sign-in counts. Known internal accounts are excluded; the link ledger has no runtime environment field, so sandbox provenance cannot be independently verified. Guest recovery and report synchronization are separate observed event paths, not steps in a shared funnel.">
      <div className="grid gap-6 sm:grid-cols-2"><Stat title="Accounts linked to prior activity" value={count(links?.accounts)} note="Distinct accounts with stored identity links in this period" /><Stat title="Stored identity links" value={count(links?.links)} note="Account-to-anonymous-identity records · selected platform and period" /></div>
      <DataDetails><Table rows={report.support.map(row => ({ activity: name(row.event_name), events: row.events, devices: row.devices }))} columns={['activity','events','devices']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Only observed activities are listed. No event does not establish that a recovery or synchronization feature was unused.</p></DataDetails>
    </Panel>
    <Panel title="Data sources and freshness" description="Snapshot timing and authentication tracking coverage.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated', data.generatedAt], ['Latest authentication event', summary?.latest_event], ['Latest event received', summary?.latest_receipt]].map(([title, value]) => <div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
      <p className="mt-5 text-sm leading-6 text-zinc-500">{Number(summary?.starts) > 0 ? `${percent(Number(summary?.starts_with_attempt), Number(summary?.starts))} of sign-in start events include an attempt identifier.` : 'No sign-in starts were recorded to measure attempt coverage.'} Completion rates are not inferred from independent starts and outcomes. Older releases may group cancellations and setup errors under sign-in errors.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Source: production customer analytics events and stored identity links. Checks every minute while visible and on return to this tab; snapshots use a 60-second cache with background revalidation. Counts cover instrumented client flows and may not capture every sign-in. Known internal accounts and explicitly identified sandbox activity are excluded from client events. Legacy events without runtime evidence remain included. Source timestamps show observed activity, not guaranteed collection completeness.</p>
      <DataDetails><Table rows={[
        { measurement: 'Sign-in starts with an attempt identifier', value: summary?.starts_with_attempt ?? null },
        { measurement: 'Cancellations or errors with a recorded stage', value: summary?.classified_issues ?? null },
        { measurement: 'Mobile events without confirmed runtime provenance', value: summary?.runtime_unconfirmed_events ?? null },
        { measurement: 'Latest stored identity link in period', value: time(links?.latest_link) },
      ]} columns={['measurement','value']} /></DataDetails>
    </Panel>
  </>
}
