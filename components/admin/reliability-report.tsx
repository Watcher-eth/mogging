import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import type { ReliabilityData } from '@/lib/admin/reliability'
import { AnalyticsChart, chartColors } from './analytics-chart'
import { Notice, Panel, Stat, Table, Bars, DataDetails, count } from './analytics-ui'

export function ReliabilityReport({days}:{days:number}) {
  const report=useSWR<ReliabilityData>(`/api/admin/reliability?days=${days}`,apiGet,{refreshInterval:15_000,dedupingInterval:10_000,shouldRetryOnError:false})
  if(report.error) return <Notice>Reliability monitoring could not load. The backend may be unavailable. <button className="underline" onClick={()=>void report.mutate()}>Retry</button>.</Notice>
  const data=report.data
  if(!data) return <Notice>Checking backend health…</Notice>
  return <>
    <div className={`mb-7 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${data.health.ok && data.available?'bg-[#f1faf5] text-[#21734a]':'bg-[#fff4ef] text-[#a33f20]'}`} role="status">
      <span>{data.health.ok && data.available?'Backend health check passed':'Backend needs attention'} · Database {data.health.database?'reachable':'unavailable'} · Runtime {data.health.configured?'configured':'incomplete'}</span>
      <span className="text-xs">Checks refresh every 15 seconds</span>
    </div>
    {!data.alerts.configured || !data.alerts.deduplication ? <Notice>Email alerts are inactive: {!data.alerts.configured?'configure the alert recipient and email provider.':'configure shared Redis deduplication.'} The dashboard continues to show recorded failures.</Notice>:null}
    {!data.available?<Notice>Stored telemetry is unavailable. Counts and charts are withheld until the database report recovers.</Notice>:<>
      {!Number(data.summary.requests)?<Notice>No monitored backend requests recorded in this period. Collection begins with the deployment of this version; empty telemetry does not establish availability.</Notice>:null}
      <div className="admin-stats-grid"><Stat title="Technical failures · 15 min" value={count(data.summary.recent_failures)} note="Request failures and degraded features"/><Stat title="Requests & probes" value={count(data.summary.requests)} note="Monitored origin handlers and health signals"/><Stat title="Unfinished scans" value={count(data.stalled.length)} note="No completion signal after five minutes · last 24 hours · max 50"/><Stat title="Degraded results" value={count(data.summary.degraded)} note="Report returned with a persistence problem"/></div>
      {data.stalled.length?<Notice>Some evaluations have no final server signal. Check the trace in hosting logs; interruption or missing telemetry can cause this. Credits are not changed by monitoring.</Notice>:null}
      <Panel title="Backend failures" description={`Technical request and evaluation failures by UTC ${days === 1 ? "hour" : "day"}.`} note="Buckets without telemetry are omitted. Counts include health probes and observed origin requests; they are not uptime percentages. Boundary buckets are partial."><AnalyticsChart title="Backend failures" rows={data.daily} days={days} metrics={[{key:'failures',label:'All technical failures',color:chartColors.orange},{key:'evaluation_failures',label:'Evaluation failures',color:chartColors.violet}]}/></Panel>
      <Panel title="Feature health" description="Backend outcomes and response latency for each monitored feature." note="Expected 4xx rejections and invalid photos are separate from technical failures. Latency measures handler execution, not the user's complete upload or rendering time. Cached requests and invocations killed before recording may be absent; no traffic does not establish availability."><Table rows={data.features} columns={['feature','requests','technical_failures','degraded','rejected','invalid_photos','median_ms','p95_ms','latest_event']}/></Panel>
      <Panel title="Failure causes"><Bars rows={data.failures.map(row => ({ label: `${row.feature} · ${row.code}`, value: Number(row.events) }))}/><DataDetails><Table rows={data.failures} columns={['feature','code','outcome','events','latest_event']}/></DataDetails></Panel>
      <Panel title="Recent failures" description="Use the trace to find the matching backend log entry." note="Safe machine codes only. Response bodies, provider raw errors, credentials and photo data are not included."><Table rows={data.recent} columns={['feature','code','outcome','duration_ms','trace','latest_event']}/></Panel>
      <Panel title="Unfinished evaluations"><Table rows={data.stalled} columns={['trace','started_at']}/></Panel>
      <Panel title="Failures seen by the app" description="Client observations by released app version." note="These can overlap backend failures and must not be added to backend totals. They can also include network or device failures the server never received."><Table rows={data.clients} columns={['event','platform','release','code','events','latest_event']}/></Panel>
      <Panel title="Email alert delivery" note="The first technical failure triggers an email; repeats for the same feature and code are grouped for 15 minutes. Failed sends release the cooldown so a later failure can retry. The minute health check runs within this hosting platform; a complete hosting outage needs an independent external uptime check."><Table rows={data.notifications} columns={['feature','code','status','events','latest_event']}/></Panel>
    </>}
  </>
}
