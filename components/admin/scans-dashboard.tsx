import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, percent } from './analytics-ui'

const metrics: ChartMetric[] = [
  { key: 'completed', label: 'Completed evaluations', color: chartColors.blue },
  { key: 'failed', label: 'Failed requests', color: chartColors.orange },
  { key: 'pending', label: 'Pending outcomes', color: chartColors.violet },
]
const names: Record<string,string> = {
  unknown: 'Not recorded', ios: 'iOS', android: 'Android', web: 'Web',
  subscription_allowance: 'Subscription scan allowance', revenuecat_subscription: 'Subscription access',
  revenuecat: 'Mobile purchase access', admin_manual_grant: 'Manually granted access', referral_reward: 'Referral reward credits',
  evaluation_started: 'Evaluation starts', evaluation_completed: 'Evaluations completed', evaluation_failed: 'Evaluation failures',
  evaluation_request_started: 'Network request starts', evaluation_request_completed: 'Successful network responses', evaluation_request_failed: 'Network request failures',
  analysis_failed: 'Report generation unsuccessful', request_aborted: 'Request interrupted or timed out', request_failed: 'Request failed',
}
const name = (value: unknown) => names[String(value)] ?? (/^http_\d{3}$/.test(String(value)) ? `HTTP ${String(value).slice(5)} response` : label(String(value)))
const time = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short' }) : 'No record available'
const duration = (value: unknown) => value == null ? '—' : `${count(Number(value)/1000)} s`

export function ScansDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const report = data.scans
  if (!report) return <Notice>Scan reporting could not be established from this snapshot. Unavailable data is not shown as zero.</Notice>
  const summary=report.summary[0]
  const records=report.reports[0]
  const client=report.client[0]
  const settled=Number(summary?.completed)+Number(summary?.failed)
  const evaluationIssues=report.failures.filter(row=>row.event_name==='evaluation_failed')
  const issueMaximum=Math.max(4,Math.ceil(Math.max(0,...evaluationIssues.map(row=>Number(row.events)))/4)*4)
  const chartMetrics=metrics.filter(metric=>report.daily.some(row=>Number(row[metric.key])>0))
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days===1?'Last 24 hours':`Last ${days} days`} · All platforms · Includes free and subscription access · Pacific time</p>
    <div className="admin-stats-grid">
      <Stat title="Completed evaluations" value={count(summary?.completed)} note="Successful backend scan requests · not unique reports or paying customers" />
      <Stat title="Completion rate" value={percent(Number(summary?.completed),settled)} note={settled>0?`${count(summary?.completed)} of ${count(settled)} settled requests · pending excluded`:'No settled requests available to measure a rate'} />
      <Stat title="Failed requests" value={count(summary?.failed)} note="Backend requests marked failed · includes expired requests" />
      <Stat title="Pending outcomes" value={count(summary?.pending)} note="Unsettled records in this request cohort · not confirmed failures" />
    </div>
    <p className="mb-5 text-sm leading-6 text-zinc-500">{count(summary?.requests)} backend requests from {count(summary?.accounts)} accounts began in this period. Current outcomes are shown; recent requests can still complete. Guest accounts are included, and account counts do not represent unique people.</p>
    <Panel title="Scan outcomes" description={`${days===1?'Hourly':'Daily'} backend outcomes, grouped by request start time`}
      note="Source: scan reservation records linked to eligible access entitlements. One reservation is one backend request; an idempotent network retry can reuse that record, while a separate evaluation retry can create another. Counts include free, referral and subscription access. Completion rate is completed divided by completed plus failed requests; pending and other statuses are excluded. This is a current-state request cohort, not a fixed-maturity cohort or a measure of model accuracy. Known internal accounts, explicit sandbox credits and internal verification records are excluded. Empty buckets are omitted, boundary buckets are partial, and only series with recorded activity are displayed.">
      {chartMetrics.length?<AnalyticsChart key={days} title="Scan outcomes" rows={report.daily} metrics={chartMetrics} days={days}/>:<p className="admin-empty">No backend scan outcomes were recorded for this period.</p>}
      <p className="mt-4 text-sm leading-6 text-zinc-500">Pending for more than five minutes: {count(summary?.pending_over_five_minutes)}. {Number(summary?.pending)>0?`Oldest pending request: ${time(summary?.oldest_pending)}.`:'No pending requests are recorded in this cohort.'} Pending records do not establish that processing is still active.</p>
      {Number(summary?.other)>0?<p className="mt-3 text-xs text-zinc-500">{count(summary?.other)} requests have another stored status and are excluded from the completion rate.</p>:null}
      <DataDetails><Table rows={report.daily.map(row=>({period:time(row.day),requests:row.requests,completed:row.completed,failed:row.failed,pending:row.pending}))} columns={['period','requests','completed','failed','pending']}/></DataDetails>
    </Panel>
    <Panel title="Scan usage by access source" description="Backend requests across recorded credit and subscription sources."
      note="Source labels describe the entitlement that authorized a request, not a verified payment or new customer. Free credits, referral awards and subscription allowances can all generate evaluations. Older records may have no source. Rows do not measure revenue, average spend or acquisition efficiency.">
      <Table rows={report.sources.map(row=>({...row,source:name(row.source),completion_rate:percent(Number(row.completed),Number(row.completed)+Number(row.failed))}))} columns={['source','requests','completed','failed','pending','completion_rate']}/>
    </Panel>
    <Panel title="Saved reports" description="Evaluations can reuse existing reports or fail before a report is saved."
      note="Saved report counts use report creation time, current status and user-submitted photos across all platforms. Re-evaluating the same photo can update or reuse an existing report; a new successful request need not create a new report record. Distinct referenced reports are counted separately across completed requests begun in this period and can have been created earlier. Example photos, known internal accounts and reports linked only to excluded internal/sandbox credits are excluded. Legacy report records without provenance remain included. These counts do not establish report receipt or viewing.">
      <div className="grid gap-6 sm:grid-cols-3">
        <Stat title="Completed report records" value={count(records?.completed)} note="Records created in this period · current completed status"/>
        <Stat title="Failed report records" value={count(records?.failed)} note="Records created in this period · current failed status"/>
        <Stat title="Distinct reports from completed requests" value={count(summary?.distinct_reports)} note="Unique stored report references · request-start cohort"/>
      </div>
      <DataDetails><Table rows={[
        {measurement:'Report records with another status',value:records?.other??null},
        {measurement:'Completed requests without a stored report reference',value:summary?.missing_report_reference??null},
        {measurement:'Latest report created in this period',value:time(records?.latest_created)},
        {measurement:'Latest update to reports created in this period',value:time(records?.latest_updated)},
      ]} columns={['measurement','value']}/></DataDetails>
    </Panel>
    <Panel title="Client evaluation experience" description="Observed evaluation time and reported issues, separate from backend outcomes."
      note="Source: evaluation client events, across platforms. Timing uses valid duration values from successful evaluation_completed events and includes client, network and server work; it is not backend-only processing time. Failed or missing completions are outside the timing sample. Request-level timing in the underlying data measures individual network attempts instead. A client timeout can occur before the backend finishes successfully. Request, evaluation and backend reservation counts have different scopes and must not be added or divided to infer a success rate. Error bars show the top eight evaluation-failure platform/reason groups; all reported evaluation and network issues remain in the underlying data. Device counts can overlap reasons.">
      <div className="mb-6 grid gap-6 sm:grid-cols-2"><Stat title="Median observed evaluation" value={duration(client?.evaluation_median_ms)} note={`${count(client?.timed_evaluations)} successful evaluation events with valid duration`}/><Stat title="90th percentile evaluation time" value={duration(client?.evaluation_p90_ms)} note="Successful evaluations with timing only · excludes failed or missing completions"/></div>
      <p className="mb-5 text-sm leading-6 text-zinc-500">Client evaluation events: {count(client?.evaluation_starts)} starts · {count(client?.evaluation_completions)} completions · {count(client?.evaluation_failures)} failures. These are independent observations, not a matched conversion funnel.</p>
      <Bars animated maximum={issueMaximum} labelWidth={250} rows={evaluationIssues.slice(0,8).map(row=>({label:`${name(row.platform)} · ${name(row.reason)}`,value:Number(row.events),detail:`${count(row.affected_devices)} affected devices`}))}/>
      <DataDetails><h3 className="mb-3 text-sm font-medium">Recorded client issues</h3><Table rows={report.failures.map(row=>({...row,event_name:name(row.event_name),platform:name(row.platform),reason:name(row.reason)}))} columns={['event_name','platform','reason','events','affected_devices']}/><h3 className="mb-3 mt-6 text-sm font-medium">Network request observations by release</h3><Table rows={report.releases.map(row=>({...row,platform:name(row.platform)}))} columns={['platform','release','starts','completions','failures','timed_completions','median_ms']}/><h3 className="mb-3 mt-6 text-sm font-medium">Evaluation and network observations</h3><Table rows={report.events.map(row=>({activity:name(row.event_name),events:row.events,devices:row.devices}))} columns={['activity','events','devices']}/><p className="mt-3 text-xs leading-5 text-zinc-500">An evaluation can contain multiple network requests. Older clients may omit request-level events; raw event counts are not a matched evaluation funnel. Missing request telemetry does not mean no requests occurred.</p></DataDetails>
    </Panel>
    <Panel title="Data sources and freshness" description="Snapshot time, backend records and client ingestion are separate signals.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Latest backend request started',summary?.latest_request],['Latest client event received',client?.latest_receipt]].map(([title,value])=><div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Sources: backend scan reservations, access entitlements, saved user reports and production client analytics. Checks every minute while visible and on return to this tab; snapshots use a 60-second cache with background revalidation. Backend records have no reliable platform field, so this report uses all platforms. Reservation completion timestamps are not stored; current status is read at snapshot time. No backend processing duration is inferred from report updates. Latest activity does not guarantee complete collection.</p>
      <DataDetails><Table rows={[
        {measurement:'Latest client scan event',value:time(client?.latest_event)},
        {measurement:'Client request starts without a request identifier',value:client?.requests_without_id??null},
        {measurement:'Mobile scan events without confirmed runtime provenance',value:client?.runtime_unconfirmed_events??null},
      ]} columns={['measurement','value']}/><p className="mt-3 text-xs leading-5 text-zinc-500">Client analytics excludes known internal accounts and explicit sandbox activity. Legacy events without runtime evidence and eligible legacy report records remain included. Failed scan credits are restored only when the entitlement is eligible; this report does not infer cash refunds or count failed requests as universally returned credits.</p></DataDetails>
    </Panel>
  </>
}
