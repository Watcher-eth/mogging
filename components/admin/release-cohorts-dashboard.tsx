import useSWR from 'swr'
import {apiGet} from '@/lib/api/client'
import type {MetricRow} from '@/lib/admin/analytics'
import {formatReportingTime} from '@/lib/admin/reporting-time'
import {Panel,Table} from './analytics-ui'

const outcome=(value:unknown,eligible:unknown)=>Number(eligible)>0 && value!=null
  ? `${value}/${eligible} · ${(Number(value)/Number(eligible)*100).toFixed(1)}%` : 'Pending follow-up'

export function ReleaseCohortsDashboard({days}:{days:number}) {
  const window=[7,14,30,90].includes(days)?days:7
  const report=useSWR<{generatedAt:string;rows:MetricRow[]}>(`/api/admin/release-cohorts?days=${window}`,apiGet,
    {dedupingInterval:60000,refreshInterval:60000,shouldRetryOnError:false})
  const rows=report.data?.rows
  return <Panel title="Release outcomes" description={`Last ${window} days · Actual customer paywall exposure by app version.`}
    note="Observational cohorts, not a randomized experiment. Each first verified paying account is assigned once, to its most recent preceding paywall within seven days. Internal and sandbox activity are excluded. Outcome rates use only customers with complete follow-up; missing observations do not prove inactivity. Devices can appear on multiple releases. First exposure checks include 30 days of earlier history.">
    {report.error?<p role="alert" className="admin-empty">Release outcomes could not refresh. {rows?'Showing the previous snapshot. ':''}<button className="underline" onClick={()=>void report.mutate()}>Try again</button></p>:null}
    {!rows&&!report.error?<div role="status" aria-label="Loading release outcomes" className="animate-pulse space-y-3 motion-reduce:animate-none">{[0,1,2].map(i=><div key={i} className="h-10 rounded-lg bg-zinc-100"/>)}</div>:null}
    {rows?<>
      <Table rows={rows.map(row=>({...row,
        status:Number(row.paywall_devices)===0?'No paywall exposure':Number(row.eligible7)>0?'7-day outcomes available':'Observing · follow-up pending',
        first_paywall:typeof row.first_paywall==='string'?formatReportingTime(row.first_paywall,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—',
        verified_conversion:Number(row.paywall_devices)>0?`${row.verified_buyers}/${row.paywall_devices} · ${(Number(row.verified_buyers)/Number(row.paywall_devices)*100).toFixed(1)}%`:'Not exposed',
        identity_coverage:Number(row.paywall_devices)>0?outcome(row.linked_devices,row.paywall_devices):'Not exposed',
      }))} columns={['release','platform','status','first_paywall','first_opens','paywall_devices','verified_conversion','identity_coverage']}/>
      <p className="my-4 text-xs leading-5 text-zinc-500">Conversion is provisional until seven days after paywall exposure. Billing is provider-confirmed; it is not inferred from a successful button tap.</p>
      <Table rows={rows.filter(row=>Number(row.paywall_devices)>0).map(row=>({...row,
        report_viewed_24h:outcome(row.report_viewed24,row.eligible24),
        canceled_24h:outcome(row.canceled24,row.eligible24),
        refunded_7d:outcome(row.refunded7,row.eligible7),
        protocol_action_7d:outcome(row.task7,row.eligible7),
        second_scan_7d:outcome(row.repeat_scan7,row.eligible7),
      }))} columns={['release','verified_buyers','eligible24','report_viewed_24h','canceled_24h','eligible7','refunded_7d','protocol_action_7d','second_scan_7d']}/>
    </>:null}
  </Panel>
}
