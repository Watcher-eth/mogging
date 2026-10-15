import { useState } from 'react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import type { PurchaseAttemptsReport } from '@/lib/admin/purchase-attempt-query'
import { Panel, Stat, Table, Notice, count, percent, label } from './analytics-ui'

const outcomeLabels: Record<string,string> = {
  activated: 'Purchased · access activated', purchased_access_failed: 'Purchased · activation failed',
  purchased_access_pending: 'Purchased · activation unresolved', account_required: 'Purchased · account needed',
  cancelled: 'Store reported cancellation', preparation_failed: 'Failed before store request',
  store_failed: 'Store / SDK failure', pending: 'Payment awaiting approval', in_progress: 'Recent · outcome not recorded',
  unresolved: 'Unresolved · no final result',
}
export function PurchaseAttemptsReportView({ days, platform }: { days: number; platform: string }) {
  const { data,error,isLoading } = useSWR(`/api/admin/purchase-attempts?days=${days}&platform=${platform}`,url => apiGet<PurchaseAttemptsReport>(url),{ revalidateOnFocus:false, shouldRetryOnError:false })
  if (error) return <Notice>Purchase diagnostics could not load. Refresh to retry.</Notice>
  if (isLoading || !data) return <Notice>Loading purchase attempts…</Notice>
  return <PurchaseAttemptDetails key={`${days}:${platform}`} data={data} />
}
export function PurchaseAttemptDetails({ data }: { data: PurchaseAttemptsReport }) {
  const [kind,setKind] = useState('subscription')
  const [surface,setSurface] = useState('all')
  const [release,setRelease] = useState('all')
  const [coverage,setCoverage] = useState('all')
  const attempts = data.attempts.filter(attempt =>
    !attempt.sandbox && attempt.context.store_environment !== 'sandbox' &&
    (kind === 'all' || (attempt.context.purchase_kind ?? (attempt.context.surface === 'scan_upgrade' ? 'scan' : 'subscription')) === kind) &&
    (surface === 'all' || attempt.context.surface === surface) && (release === 'all' || attempt.release === release) &&
    (coverage === 'all' || attempt.context.purchase_tracking_version === '2'))
  const requested = attempts.filter(attempt => attempt.requested).length
  const purchased = attempts.filter(attempt => attempt.purchased).length
  const activated = attempts.filter(attempt => attempt.activated).length
  const outcomes = Object.entries(outcomeLabels).map(([outcome,name]) => {
    const rows = attempts.filter(attempt => attempt.outcome === outcome)
    const durations = rows.map(row => row.storeDurationMs).filter((v): v is number => v !== null).sort((a,b) => a-b)
    const mid = Math.floor(durations.length/2)
    const median = durations.length ? durations.length%2 ? durations[mid] : (durations[mid-1]+durations[mid])/2 : null
    return { outcome:name, attempts:rows.length, devices:new Set(rows.map(row => row.device)).size, median_store_ms:median }
  })
  const failures = new Map<string,{release:string; stage:string; reason:string; error_code:string; http_status:string; native_error:string; attempts:number; devices:Set<string>}>()
  for (const attempt of attempts) {
    if (!['preparation_failed','store_failed','purchased_access_failed'].includes(attempt.outcome)) continue
    const native = `${attempt.context.native_domain ?? ''} ${attempt.context.native_code ?? ''}${attempt.context.native_underlying_domain ? ` → ${attempt.context.native_underlying_domain} ${attempt.context.native_underlying_code ?? ''}` : ''}`.trim()
    const code = String(attempt.context.error_code ?? 'not recorded')
    const http = String(attempt.context.http_status ?? '');
    const key = `${attempt.release}:${attempt.stage}:${attempt.reason}:${code}:${http}:${native}`
    const row = failures.get(key) ?? {release:attempt.release,stage:label(attempt.stage),reason:attempt.reason ? label(attempt.reason) : 'not recorded',error_code:code,http_status:http || '—',native_error:native || 'not recorded',attempts:0,devices:new Set<string>()}
    row.attempts++; row.devices.add(attempt.device); failures.set(key,row)
  }
  return <>
    <Panel title="What happened after Subscribe?" description="Each tap is one attempt; retries remain separate. Known sandbox purchases are excluded." note="Store requested means RevenueCat was called, not that Apple's sheet was visibly presented. Backgrounding is context, not proof of abandonment. Older builds may omit stages or results. The store environment can remain unknown before a purchase returns.">
      <div className="mb-6 flex flex-wrap gap-3">
        {[
          {name:'Purchase type',value:kind,set:setKind,options:[['subscription','Subscriptions'],['scan','Scan purchases'],['all','All purchases']]},
          {name:'Paywall',value:surface,set:setSurface,options:[['all','All paywalls'],...Array.from(new Set(data.attempts.map(a => String(a.context.surface ?? 'unknown')))).map(s => [s,label(s)])]},
          {name:'App build',value:release,set:setRelease,options:[['all','All builds'],...Array.from(new Set(data.attempts.map(a => a.release))).map(s => [s,s])]},
          {name:'Tracking coverage',value:coverage,set:setCoverage,options:[['all','All linked attempts'],['2','Detailed tracking only']]},
        ].map(filter => <label key={filter.name} className="flex flex-col gap-1 text-xs text-[#73777d]">{filter.name}<select aria-label={filter.name} value={filter.value} onChange={event => filter.set(event.target.value)} className="rounded-xl border border-[#e7e9eb] bg-white px-3 py-2 text-sm text-[#17191c]">{filter.options.map(([value,name]) => <option key={value} value={value}>{name}</option>)}</select></label>)}
      </div>
      {data.truncated ? <Notice>Showing the most recent 2,000 linked attempts in this window. The existing funnel above covers the whole window.</Notice> : null}
      <div className="admin-stats-grid">
        <Stat title="Button taps" value={count(attempts.length)} note={`${count(new Set(attempts.map(a => a.device)).size)} devices · linked attempts only`} />
        <Stat title="Store requested" value={count(requested)} note={`${percent(requested,attempts.length)} of taps`} />
        <Stat title="Purchase observed" value={count(purchased)} note={`${percent(attempts.filter(a => a.requested && a.purchased).length,requested)} per observed store request`} />
        <Stat title="Access activated" value={count(activated)} note={`${percent(activated,purchased)} per observed purchase`} />
      </div>
      <p className="mb-5 text-xs text-[#858a91]">Taps → purchase: {percent(purchased,attempts.length)}. {count(attempts.filter(a => a.verified).length)} attempts have an exact transaction match in the production billing ledger. {count(attempts.filter(a => a.context.purchase_tracking_version === '2').length)} have detailed tracking. Devices can appear in multiple outcomes across retries.</p>
      <Table rows={outcomes} columns={['outcome','attempts','devices','median_store_ms']} />
    </Panel>
    <Panel title="Failure details" description="Safe SDK codes and native error codes, separated by build and stage.">
      <Table rows={[...failures.values()].map(row => ({...row,devices:row.devices.size})).sort((a,b) => b.attempts-a.attempts)} columns={['release','stage','reason','error_code','http_status','native_error','attempts','devices']} />
    </Panel>
    <Panel title="Why people cancelled" description="Optional feedback after a store-reported cancellation." note="Responses are voluntary. The question appears at most once a week per device, so these responses do not represent every cancelled attempt.">
      <Table rows={Object.entries({price:'Price too high',not_ready:'Not ready yet',payment_trouble:'Payment or store account trouble',other:'Something else'}).map(([reason,name]) => {
        const rows = attempts.filter(attempt => attempt.feedback === reason)
        return { reason:name, responses:rows.length, devices:new Set(rows.map(row => row.device)).size }
      })} columns={['reason','responses','devices']} />
    </Panel>
    <Panel title="Attempt timelines" description="The most recent 80 attempts matching your filters. Expand an attempt to inspect each milestone." note="Device labels are pseudonyms. Unresolved means no final result was observed; it does not mean cancelled. Payment approval can arrive later.">
      {!attempts.length ? <p className="admin-empty">No linked attempts in this window. New mobile tracking requires the updated app build.</p> : null}
      {attempts.slice(0,80).map(attempt => <details key={`${attempt.device}:${attempt.id}`} className="border-b border-[#edf0f2] py-4 last:border-0">
        <summary className="cursor-pointer text-sm"><span className="font-medium">{outcomeLabels[attempt.outcome]}</span><span className="ml-3 text-xs text-[#858a91]">{attempt.device} · {attempt.release} · {new Date(attempt.started).toLocaleString()} · {String(attempt.context.plan ?? attempt.context.productId ?? '')}</span></summary>
        <div className="mt-4"><Table rows={attempt.events.map(event => ({
          time:new Date(event.at).toLocaleTimeString(), event:({purchase_started:'Purchase button tapped',checkout_started:'Store purchase requested',purchase_completed:'SDK purchase returned'} as Record<string,string>)[event.event] ?? label(event.event), stage:label(String(event.properties.purchase_stage ?? '')),
          result:label(String(event.properties.result ?? event.properties.reason_code ?? event.properties.feedback_reason ?? '')),
          elapsed_ms:Math.max(0,Date.parse(event.at)-Date.parse(attempt.started)),
          stage_ms:typeof event.properties.stage_duration_ms === 'number' ? event.properties.stage_duration_ms : null,
          app_state:String(event.properties.app_state ?? ''),
        }))} columns={['time','event','stage','result','elapsed_ms','stage_ms','app_state']} />
        <p className="mt-3 text-xs text-[#858a91]">Billing ledger: {attempt.verified ? 'Exact production transaction match' : 'No exact transaction match recorded'} · Paywall: {String(attempt.context.surface ?? 'unknown')} · Price: {String(attempt.context.price ?? 'not recorded')} · OS: {String(attempt.context.os_version ?? 'not recorded')} · Store environment: {String(attempt.context.store_environment ?? 'unknown')}</p></div>
      </details>)}
    </Panel>
  </>
}
