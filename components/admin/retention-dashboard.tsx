import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, percent } from './analytics-ui'

const horizons = [1, 7, 30]
const percentValue = (value: number) => `${value.toFixed(1)}%`
// Liveline pads a flat series around zero; suppress impossible percentage axis ticks.
const percentAxisValue = (value: number) => value < 0 || value > 100 ? '' : percentValue(value)
const metrics: ChartMetric[] = [{ key: 'rate', label: 'Day-7 return rate', color: chartColors.blue }]
const rate = (row?: MetricRow) => row && Number(row.eligible) > 0 && row.retained != null ? Number(row.retained) / Number(row.eligible) * 100 : null
const time = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No observation available'
const cohortRows = (rows: MetricRow[]): MetricRow[] => rows.map(row => ({ ...row, return_day: `Day ${row.day}`, return_rate: rate(row) == null ? 'Not yet measurable' : percentValue(rate(row)!), pending: row.pending ?? Math.max(0, Number(row.cohort_accounts ?? 0) - Number(row.eligible ?? 0)) }))

export function RetentionDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const rows = horizons.map(day => data.retention?.find(row => Number(row.day) === day))
  const coverage = data.retentionCoverage?.[0]
  const weekly: Array<MetricRow & { rate: number | null }> = (data.retentionWeekly ?? []).map(row => ({ ...row, rate: rate(row) }))
  const cohortCount = rows[0]?.cohort_accounts
  const platform = data.filters.platform === 'all' ? 'All platforms' : data.filters.platform === 'ios' ? 'iOS' : data.filters.platform === 'android' ? 'Android' : 'Web'
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} of new cohorts · {platform} · Pacific cohort dates · Identified customer accounts</p>
    <p className="mb-5 text-sm leading-6 text-zinc-500">Return after the first observed scan, based on account-linked client activity. Each rate uses its own fully observed 24-hour return window; sample sizes differ.</p>
    <div className="admin-stats-grid">
      {horizons.map((day, index) => {
        const row = rows[index]
        const value = rate(row)
        return <Stat key={day} title={`Day-${day} return rate`} value={value == null ? '—' : percentValue(value)} note={row ? `${count(row.retained)} returned / ${count(row.eligible)} eligible · ${count(row.pending)} awaiting full follow-up` : 'Cohort data unavailable'} />
      })}
      <Stat title="New scan customers" value={count(cohortCount)} note="Accounts whose first observed completed scan falls in the selected period" />
    </div>
    {rows.every(row => rate(row) == null) ? <Notice>No mature scan cohorts are available for these return windows. Rates remain unavailable until the full follow-up is observed; they are not recorded as zero.</Notice> : null}
    <p className="mb-5 text-xs leading-5 text-zinc-500">Small samples can produce large percentage changes. An unavailable rate has no eligible sample; a measured 0% means eligible accounts had no observed return.</p>
    <DataDetails><Table rows={cohortRows(data.retention ?? [])} columns={['return_day', 'cohort_accounts', 'eligible', 'pending', 'retained', 'return_rate']} /></DataDetails>
    <Panel title="Day-7 retention by weekly cohort" description="Return rate for customers grouped by the week of their first observed scan."
      note="Each point uses only eligible accounts within that Pacific-time entry week. Recent accounts with incomplete eight-day follow-up are pending, even within a week that contains eligible accounts. Cohort weeks at the selected period boundaries can be partial. Rates with no eligible sample are omitted from the chart and remain unavailable in the table; missing points must not be interpreted as zero. Compare sample sizes before interpreting changes; small cohorts can vary substantially.">
      {weekly.some(row => row.rate != null) ? <AnalyticsChart title="Day-7 retention by weekly cohort" rows={weekly} metrics={metrics} days={days} granularity="daily" fitToData valueFormatter={percentAxisValue} /> : <p className="admin-empty">No weekly cohort has a fully observed day-7 return window in this slice.</p>}
      <DataDetails><Table rows={weekly.map(row => ({ ...row, cohort_week: typeof row.day === 'string' ? formatReportingTime(row.day, { month: 'short', day: 'numeric', year: 'numeric' }) : row.day, return_rate: row.rate == null ? 'Not yet measurable' : percentValue(row.rate) }))} columns={['cohort_week', 'cohort_accounts', 'eligible', 'pending', 'retained', 'return_rate']} /></DataDetails>
    </Panel>
    <Panel title="Subscriber engagement after purchase" description="Protocol use and a second scan within 7 or 14 days of the first paid subscription. All platforms."
      note="Source: production provider-confirmed subscription payments, server scan records and observed client task completions. Linked accounts enter at their earliest recorded positive subscription payment, excluding one-off scan purchases. Only subscribers with complete 7- or 14-day follow-up enter either rate. Protocol use requires a completed task after payment. A second scan requires a different completed report ID at least 24 hours after the first successful post-payment scan started, within the follow-up window. Retries and report reopening do not qualify. These are engagement rates among paid subscriber cohorts, not subscription renewal or paid retention rates. Missing client observations do not prove inactivity.">
      <p className="mb-5 text-sm leading-6 text-zinc-500">{(data.membershipActivation ?? []).map(row => `${row.window_days}-day sample: ${count(row.eligible)} eligible / ${count(row.subscribers)} subscribers · ${count(row.pending)} pending`).join(' · ') || 'No subscriber cohort data available.'}</p>
      <Bars animated labelWidth={190} maximum={100} rows={(data.membershipActivation ?? []).flatMap(row => [
        { label: `${row.window_days} days · Protocol use`, value: Number(row.eligible) > 0 ? Number(row.first_protocol_action) / Number(row.eligible) * 100 : null, detail: `${count(row.first_protocol_action)} / ${count(row.eligible)} eligible · ${count(row.pending)} pending` },
        { label: `${row.window_days} days · Second scan`, value: Number(row.eligible) > 0 ? Number(row.returned_for_second_scan) / Number(row.eligible) * 100 : null, detail: `${count(row.returned_for_second_scan)} / ${count(row.eligible)} eligible · ${count(row.pending)} pending` },
      ])} format={percentValue} />
      <DataDetails><Table rows={(data.membershipActivation ?? []).map(row => ({ ...row, follow_up: `${row.window_days} days`, protocol_use_rate: percent(Number(row.first_protocol_action), Number(row.eligible)), second_scan_rate: percent(Number(row.returned_for_second_scan), Number(row.eligible)) }))} columns={['follow_up', 'subscribers', 'eligible', 'pending', 'first_protocol_action', 'protocol_use_rate', 'returned_for_second_scan', 'second_scan_rate']} /></DataDetails>
    </Panel>
    <Panel title="Courses and Progress retention" description="Return to the same feature after its first meaningful use. Follows the platform filter."
      note="Entry is the earliest recorded lesson completion, progress-area open, or foreground feature visit lasting 10 seconds to 30 minutes. Earlier history is checked. Return meets the same rule on that same feature in its exact day-1, day-7 or day-30 window. Only account-linked customer activity and fully observed return windows are eligible. Feature cohorts overlap with scan and subscriber cohorts and must not be added together. Instrumentation coverage depends on app version; these observations do not show that a feature caused retention.">
      <p className="mb-4 text-sm leading-6 text-zinc-500">{(data.featureRetention ?? []).some(row => Number(row.cohort_accounts) > 0) ? 'Feature-specific account cohorts and their eligible return rates are available below.' : 'No account-linked meaningful use of Courses or Progress was observed in this cohort period. Feature retention is not yet measurable.'}</p>
      <DataDetails><Table rows={cohortRows(data.featureRetention ?? []).map(row => ({ ...row, feature: row.feature === 'courses' ? 'Courses' : 'Progress' }))} columns={['feature', 'return_day', 'cohort_accounts', 'eligible', 'pending', 'retained', 'return_rate']} /></DataDetails>
    </Panel>
    <Panel title="Data sources and coverage" description="Observation times and measurement limits for this snapshot." note="Source: production customer analytics events linked to an account. Entry is the earliest recorded client scan-completion event in available history on the selected platform; it is not a verified store install or server-confirmed scan count. Return includes report views, completed protocol tasks or scans, lesson completions, progress-area opens, or a foreground Courses/Progress visit lasting 10 seconds to 30 minutes. Day 7 covers hours 168–192 after entry, not any return in the first week. The full return window must end by the snapshot cutoff. Internal/sandbox traffic and anonymous-only activity are excluded. With a platform filter, both first observed use and return are scoped to that platform. The three rates have different mature samples and must not be read as a sequential funnel or churn rate.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">
        {[
          ['Snapshot generated', data.generatedAt],
          ['Latest account-linked activity', coverage?.latest_linked_activity],
          ['Latest account-linked record received', coverage?.latest_linked_receipt],
        ].map(([title, value]) => <div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}
      </dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks every minute while visible and on return to this tab. Snapshots use a 60-second cache with background revalidation. Activity and receipt times cover account-linked customer events in the selected period and platform; they do not establish complete instrumentation.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{coverage ? `${count(coverage.linked_events)} account-linked events and ${count(coverage.anonymous_events)} events without an account were observed in this slice. Anonymous events do not enter these account retention cohorts.` : 'Account-linking coverage is unavailable.'}</p>
      <DataDetails><Table rows={[
        { metric: 'Earliest observed first-scan cohort in available platform history', value: time(coverage?.earliest_scan_cohort) },
        { metric: 'Latest observed first-scan cohort in available platform history', value: time(coverage?.latest_scan_cohort) },
      ]} columns={['metric', 'value']} /></DataDetails>
    </Panel>
  </>
}
