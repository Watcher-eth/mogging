import useSWR from 'swr'
import {apiGet} from '@/lib/api/client'
import type {ReliabilityData} from '@/lib/admin/reliability'
import {AnalyticsChart,chartColors} from './analytics-chart'
import {Notice,Panel,Stat,Table,Bars,DataDetails,count,percent} from './analytics-ui'
import {operationalTime as time,operationalDuration as duration,operationalLabel as label} from './operational-format'

// Compatibility wrapper for existing authenticated consumers. The analytics workspace
// and local demo supply the same server snapshot directly, without an extra request.
export function ReliabilityReport({days}:{days:number}){
 const report=useSWR<ReliabilityData>(`/api/admin/reliability?days=${days}`,apiGet,{refreshInterval:60_000,dedupingInterval:60_000,shouldRetryOnError:false})
 if(!report.data)return <Notice>{report.error?'Reliability data could not load.':'Loading reliability snapshot…'}</Notice>
 return <ReliabilityDashboard data={report.data} days={days}/>
}
const featureNames:Record<string,string>={'cron/push-reminders':'Scheduled notification reminders','payments/stripe-reconciliation':'Stripe reconciliation','auth/[...nextauth]':'Authentication','mobile-analyze-v2':'Mobile evaluations','web-analyze-v2':'Web evaluations','analytics/events':'Analytics ingestion'}
const featureLabel=(value:unknown)=>featureNames[String(value)]??label(value)
export function ReliabilityDashboard({data,days}:{data:ReliabilityData;days:number}){
 const summary=data.summary
 const features:ReliabilityData['features']=data.features.map(row=>({...row,feature:featureLabel(row.feature),latest_event:time(row.latest_event)}))
 const affected=features.filter(row=>Number(row.technical_failures)>0||Number(row.degraded)>0)
 const issueMaximum=Math.max(4,Math.ceil(Math.max(0,...data.failures.map(row=>Number(row.events)))/4)*4)
 return <>
  <p className="mb-5 text-xs leading-5 text-zinc-500">{days===1?'Last 24 hours':`Last ${days} days`} · Recorded production backend telemetry · Includes internal, sandbox and administrative operations · Pacific time</p>
  {!data.available?<Notice>The production telemetry snapshot is unavailable. Operation counts and rates are withheld; this does not by itself establish a backend outage.</Notice>:<>
   {!Number(summary.operations)?<Notice>No monitored operation records are available for this period. Availability and a technical issue share cannot be established from empty telemetry.</Notice>:null}
   <div className="admin-stats-grid"><Stat title="Monitored operation records" value={count(summary.operations)} note="Recorded handlers and technical operations · monitoring-only signals excluded"/><Stat title="Technical issue share" value={percent(Number(summary.operation_issues),Number(summary.operations))} note={`${count(summary.operation_issues)} failed/degraded records · expected rejections and invalid photos excluded from issues`}/><Stat title="P95 recorded operation time" value={duration(summary.p95_ms)} note="Valid recorded durations · includes different operation types · not client end-to-end latency"/><Stat title="Unresolved evaluation starts" value={count(data.unresolved_count)} note="Last 24 hours · started over five minutes ago · independent of selected period"/></div>
   <Panel title="Technical issues over time" description={`${days===1?'Hourly':'Daily'} failed or degraded operation records`}
    note="Excludes availability probes, repeated unfinished-evaluation watchdog signals, expected rejections and invalid-photo outcomes from technical issue counts. These are operation observations, not necessarily unique HTTP requests or affected customers; helper diagnostics can create additional records. Collection can miss killed invocations or complete outages. Empty buckets are omitted and boundary buckets are partial. The issue share is a fraction of collected operation records, not an uptime or customer failure percentage.">
    <AnalyticsChart key={days} title="Technical issues over time" rows={data.daily} days={days} metrics={[{key:'failures',label:'Technical issue records',color:chartColors.orange}]}/>
    <p className="mt-4 text-xs leading-5 text-zinc-500">{count(summary.operation_rejections)} expected rejection records · {count(summary.invalid_photos)} invalid-photo records · {count(summary.monitoring_signals)} monitoring-only signals. These categories remain separate from technical issues.</p>
    <DataDetails><Table rows={data.daily.map(row=>({...row,period:time(row.day)}))} columns={['period','requests','failures','evaluation_failures']}/></DataDetails>
   </Panel>
   <Panel title="Operations requiring attention" description="Features with observed technical issues, prioritized for operational follow-up."
    note="Shows up to ten affected features, ordered by technical failures and observation volume. The expanded inventory retains up to 100 groups. Headline totals use all records. Execution time is measured by the originating operation and includes successful, rejected and failed outcomes with valid timing. It does not include the complete customer upload/rendering journey.">
    <Table rows={affected.slice(0,10)} columns={['feature','requests','technical_failures','degraded','p95_ms','latest_event']}/>
    <DataDetails><h3 className="mb-3 text-sm font-medium">All monitored features</h3><Table rows={features} columns={['feature','requests','technical_failures','degraded','rejected','invalid_photos','median_ms','p95_ms','latest_event']}/></DataDetails>
   </Panel>
   <Panel title="Technical issue categories" description="The eight most frequent feature/code groups in the period.">
    <Bars animated maximum={issueMaximum} labelWidth={250} rows={data.failures.slice(0,8).map(row=>({label:`${featureLabel(row.feature)} · ${label(row.code)}`,value:Number(row.events)}))}/>
    <DataDetails><Table rows={data.failures.map(row=>({...row,feature:featureLabel(row.feature),code:label(row.code),outcome:label(row.outcome),latest_event:time(row.latest_event)}))} columns={['feature','code','outcome','events','latest_event']}/><p className="mt-3 text-xs leading-5 text-zinc-500">Up to 100 issue groups. Recent trace details below retain up to 50 records.</p><Table rows={data.recent.map(row=>({...row,latest_event:time(row.latest_event)}))} columns={['feature','code','outcome','duration_ms','trace','latest_event']}/></DataDetails>
   </Panel>
   <Panel title="Evaluation follow-up" description="Production starts without a matching final server marker in the last 24 hours."
    note="Starts are deduplicated by recorded trace and must be older than five minutes. A final production backend marker for the same trace resolves the signal. Missing telemetry, interruption or genuinely unfinished work can all leave an unresolved start. The headline is uncapped; the detail list retains up to 50 traces. This signal does not establish a failed scan or active processing.">
    <p className="text-sm leading-6 text-zinc-500">{count(data.unresolved_count)} unresolved starts. {count(data.stalled.length)} recent trace references are available for operational follow-up.</p>
    <DataDetails><Table rows={data.stalled.map(row=>({...row,started_at:time(row.started_at)}))} columns={['trace','started_at']}/><h3 className="mb-3 mt-6 text-sm font-medium">Separate client observations</h3><Table rows={data.clients.map(row=>({...row,latest_event:time(row.latest_event)}))} columns={['event','platform','release','code','events','latest_event']}/><p className="mt-3 text-xs leading-5 text-zinc-500">Up to 100 customer client groups, excluding known internal and explicit sandbox activity. These may overlap server issues or describe device/network failures the server never received; they are not added to server totals.</p></DataDetails>
   </Panel>
   <Panel title="Recorded email alert attempts" description="Production alert records by outcome, without exposing recipients."
    note="A sent record indicates provider acceptance, not inbox delivery. Repeated feature/code alerts can be suppressed by a 15-minute shared cooldown and may produce no new alert record. Complete hosting outages require an independent monitor to establish availability; this report only shows stored telemetry.">
    <Table rows={data.alertSummary.map(row=>({...row,status:row.status==='sent'?'Provider accepted':label(row.status),latest_event:time(row.latest_event)}))} columns={['status','records','latest_event']}/>
   </Panel>
  </>}
  <Panel title="Runtime checks and freshness" description="Current execution context and stored production telemetry are different scopes.">
   <Table rows={[{check:'Runtime serving this snapshot',result:data.runtime},{check:'Database connection probe',result:data.health.database?'Succeeded':'Did not succeed'},{check:'Runtime configuration readiness',result:data.health.configured?'Configured':'Incomplete'},{check:'Email alert configuration in this runtime',result:data.alerts.configured&&data.alerts.deduplication?'Configured with shared deduplication':'Incomplete'}]} columns={['check','result']}/>
   <dl className="mt-6 grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Current-runtime probe checked',data.health.checked_at],['Latest production operation or signal',summary.latest_event]].map(([title,value])=><div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
   <p className="mt-5 text-xs leading-5 text-zinc-500">The database/configuration probe checks the runtime serving this page. In the local demo that is local development; it does not verify the production deployment’s configuration or end-to-end availability. Stored telemetry above is production-scoped. Snapshots check every minute while visible and on focus, with a 60-second cache and background revalidation. Safe diagnostic codes and opaque trace references are retained; raw provider errors, response bodies, photos and credentials are not displayed.</p>
  </Panel>
 </>
}
