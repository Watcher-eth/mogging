import { AnalyticsLink as Link } from './analytics-link'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count } from './analytics-ui'

const usageMetrics: ChartMetric[] = [
  { key: 'actors', label: 'Active devices', color: chartColors.blue },
  { key: 'first_opens', label: 'First-time installs · observed', color: chartColors.violet },
]
const scanMetrics: ChartMetric[] = [
  { key: 'completed', label: 'Completed scans', color: chartColors.green },
  { key: 'failed', label: 'Failed scans', color: chartColors.orange },
]
const timestamp = (value: string) => formatReportingTime(value, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})
const linkClass = 'text-sm font-medium text-[#008ac5] underline underline-offset-4'

export function ProductOverview({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const scans = data.scanLedger
  const delivery = data.paidDelivery?.find(row => Number(row.window_days) === 1)
  const eligible = Number(delivery?.eligible ?? 0)
  const viewed = Number(delivery?.report_viewed ?? 0)
  const platform = data.filters.platform === 'all' ? 'All platforms' : data.filters.platform === 'ios' ? 'iOS' : data.filters.platform === 'web' ? 'Web' : 'Android'
  const period = days === 1 ? 'Last 24 hours' : `Last ${days} days`
  const bucket = days === 1 ? 'Hourly' : 'Daily'
  const detailHref = (page: string) => ({ pathname: `/admin/analytics/${page}`, query: { days: String(days), platform: data.filters.platform } })

  return <>
    {!data.summary.events ? <Notice>No customer activity events were observed for this period and platform. Server-confirmed scans and paid delivery are reported separately below; missing observations do not prove no usage.</Notice> : null}
    <p className="mb-5 text-xs leading-5 text-zinc-500">{period} · Pacific time · Activity follows the platform filter. Scans and paid delivery cover all platforms.</p>
    <div className="admin-stats-grid !grid-cols-1 sm:!grid-cols-3">
      <Stat title="Active devices" value={count(data.summary.actors)} note={`Client activity · ${platform} · distinct devices / browsers, not people`} />
      <Stat title="Completed scans" value={count(scans.summary.completed)} note="Server credit ledger · all platforms · includes free credits" />
      <Stat title="First-time installs · observed" value={count(data.summary.first_opens)} note={`First app opens · ${platform} · install proxy, not verified store downloads`} />
    </div>

    <Panel title="Customer activity" description={`${bucket} active devices and observed first-time installs · ${platform}`} action={<Link href={detailHref('acquisition')} className={linkClass}>Acquisition details →</Link>}
      note="Source: recorded customer activity events. First-time installs use distinct app first-open observations as a proxy; they do not verify a first-ever download and reinstalls or missing events can affect counts. Each device/browser counts once in the period total and once per chart bucket; daily counts must not be added to reproduce the period total. A person can use multiple devices. Creator/admin pages, explicitly internal accounts and known sandbox sessions are excluded. Older activity without runtime evidence remains included. Empty buckets are omitted; gaps do not establish zero usage. Boundary buckets are partial.">
      <AnalyticsChart rows={data.daily} metrics={usageMetrics} days={days} title="Customer activity" />
      <DataDetails><Table rows={data.daily} columns={['day', 'actors', 'first_opens']} /></DataDetails>
    </Panel>

    <Panel title="Scan outcomes" description={`${bucket} server-confirmed scans · all platforms · includes free credits`} action={<Link href={detailHref('scans')} className={linkClass}>Scan details →</Link>}
      note="Source: backend scan-credit reservations, grouped by reservation start time in Pacific time. Completed means the reservation finished successfully; failed reservations restore credit only when the entitlement is eligible. Pending reservations can change later. These are scan attempts, not distinct reports or client completion events. Known internal and sandbox checks are excluded. The platform filter does not apply. Empty buckets are omitted and boundary buckets are partial.">
      <AnalyticsChart rows={scans.daily} metrics={scanMetrics} days={days} title="Scan outcomes" />
      <p className="mt-4 text-sm leading-6 text-zinc-500">{count(scans.summary.failed)} failed requests recorded · {count(scans.summary.pending)} still processing</p>
      <DataDetails><Table rows={scans.daily} columns={['day', 'started', 'completed', 'failed', 'pending']} /></DataDetails>
    </Panel>

    <Panel title="Paid customer report delivery" description="Outcomes within 24 hours of a first verified payment · all platforms" action={<Link href={detailHref('purchases')} className={linkClass}>Delivery details →</Link>}
      note="Source: verified production billing linked to accounts, backend scan reservations, and client report-view events. Accounts enter on their earliest recorded positive payment in this period; earlier history is checked and renewals do not create another customer. Only payers with a full 24-hour follow-up enter the denominator. Generation requires a completed post-payment reservation; viewing must match its report, including successful retries. Missing client views do not prove a report was never seen. Internal and known sandbox accounts are excluded. Unlinked payments cannot be assigned an outcome. These bars share a denominator and are not a sequential conversion funnel.">
      {delivery && eligible > 0 ? <>
        <Bars maximum={100} format={value => `${value.toFixed(1)}%`} rows={[
          { label: 'Report generated', value: Number(delivery.report_generated) / eligible * 100, detail: `${count(delivery.report_generated)} of ${count(eligible)} eligible payers · server confirmed` },
          { label: 'Report viewed', value: viewed / eligible * 100, detail: `${count(viewed)} of ${count(eligible)} eligible payers · client observed` },
        ]} />
        <p className="mt-4 text-sm leading-6 text-zinc-500">{count(eligible - viewed)} eligible payers without an observed report view within 24h.</p>
      </> : <p className="admin-empty">No payers with a full 24-hour follow-up in this period. A delivery rate is not available yet.</p>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">{delivery ? `${count(delivery.pending)} payers awaiting a full 24h follow-up; excluded from the rate.` : 'No linked payer cohort returned for this period.'}</p>
    </Panel>

    <Panel title="Data sources & freshness" description="Snapshot time and observed activity are separate signals.">
      <dl className="grid gap-5 text-sm sm:grid-cols-2">
        <div><dt className="text-zinc-500">Snapshot generated</dt><dd className="mt-1 font-medium">{timestamp(data.generatedAt)}</dd></div>
        <div><dt className="text-zinc-500">Latest customer activity · {platform}</dt><dd className="mt-1 font-medium">{data.summary.latest_event ? timestamp(data.summary.latest_event) : 'No events observed in this window'}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks for updates every minute while visible and when you return to this tab. Server snapshots use a 60-second cache with background revalidation; Refresh can return the previous snapshot while a new one is prepared. Snapshot time does not confirm ingestion is current. Latest activity is the client event time, not server receipt time. Separate latest-ingestion timestamps for billing and scans are not available here.</p>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
        <Link href={detailHref('onboarding')} className={linkClass}>Onboarding →</Link>
        <Link href={detailHref('retention')} className={linkClass}>Retention →</Link>
        <Link href={detailHref('revenue')} className={linkClass}>Revenue →</Link>
        <Link href={detailHref('quality')} className={linkClass}>Data health →</Link>
      </div>
      {data.audienceBreakdown ? <DataDetails><Table rows={data.audienceBreakdown} columns={['audience', 'devices', 'events', 'runtime_unconfirmed_events']} /></DataDetails> : null}
    </Panel>
  </>
}
