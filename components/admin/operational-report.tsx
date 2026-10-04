import useSWR from 'swr'
import { useState } from 'react'
import { apiGet } from '@/lib/api/client'
import type { OperationalData } from '@/lib/admin/operations'
import { Bars, DataDetails, Notice, Panel, Table, money } from './analytics-ui'
import { AnalyticsSelect } from './analytics-select'

const reports: Record<string,{title:string;note:string;columns:string[];detailTitle?:string;detailColumns:string[]}> = {
  Authentication: {title:'Stored identity links',note:'New account-to-anonymous identity links during this period, across all platforms. Verified provider identity events appear in the server milestone breakdown above. Links are not new signups.',columns:['platform','links','accounts'],detailColumns:[]},
  Purchases: {title:'Web → app handoffs',note:'Server records created in this period, across all platforms. These records do not store an environment; test records may be included. Consumed means the app claimed the handoff, not a new financial transaction.',columns:['status','handoffs','accounts'],detailColumns:[]},
  Referrals: {title:'Credited referral activity',note:'Durable signup and reward records, across all platforms. These tables do not store an environment; test accounts may be included. Link count and inviter progress are lifetime; signups and granted rewards follow the period filter.',columns:['metric','total'],detailTitle:'Inviter progress · lifetime',detailColumns:['progress','inviters']},
  Notifications: {title:'Registered push devices',note:'Current registrations grouped by environment and timezone. Session validity is evaluated now. Reminder records follow the period filter and include all environments. Records can include an in-flight send; they are not proof of device delivery. The scheduler prunes records after 35 days, so longer windows may be incomplete.',columns:['environment','timezone','devices','accounts','valid_sessions'],detailTitle:'Reminder records · period',detailColumns:['kind','records','accounts']},
  AttributionLedger: {title:'Creator revenue by link & currency',note:'Recorded during the selected period, across all platforms; explicitly sandbox events are excluded. Direct and first-touch credit describe the same underlying events and must never be added together. Amounts remain separate by currency; this ledger is creator credit, while Revenue is the normalized billing source of truth. Each table shows up to 200 groups.',columns:['credit','link','currency','purchases','paid_customers','gross','reversals','net'],detailTitle:'Attributed milestones & subscription lifecycle',detailColumns:['link','event','provider','events','attributed_actors']},
}
export function OperationalReport({days,section}:{days:number;section:string}) {
  const report = useSWR<OperationalData>(`/api/admin/analytics-operations?days=${days}&section=${section}`,apiGet,{dedupingInterval:60_000,revalidateOnFocus:false,shouldRetryOnError:false})
  const definition=reports[section]
  if (report.error) return <Notice>Stored records could not load. <button className="underline" onClick={()=>void report.mutate()}>Try again</button>.</Notice>
  if (!report.data) return <Notice>Loading stored records…</Notice>
  const rows=section==='AttributionLedger'?report.data.rows.map(row=>({...row,gross:money(row.gross,String(row.currency)),reversals:money(row.reversals,String(row.currency)),net:money(row.net,String(row.currency))})):report.data.rows
  return <><OperationalChart data={report.data} section={section}/><Panel title={definition.title} note={definition.note}><DataDetails><Table rows={rows} columns={definition.columns}/></DataDetails></Panel>{definition.detailTitle?<Panel title={definition.detailTitle}><Table rows={report.data.detail} columns={definition.detailColumns}/></Panel>:null}</>
}
function OperationalChart({data,section}:{data:OperationalData;section:string}) {
  const [selectedCurrency,setCurrency]=useState('')
  const [credit,setCredit]=useState('Direct')
  const currencies=[...new Set(data.rows.map(row=>String(row.currency || '')).filter(Boolean))].sort()
  const currency=currencies.includes(selectedCurrency)?selectedCurrency:currencies[0]
  const ledger=section==='AttributionLedger'
  const values=ledger?data.rows.filter(row=>row.currency===currency && row.credit===credit):section==='Referrals'?data.detail:data.rows
  const fields=ledger?['link','net']:section==='Authentication'?['platform','links']:section==='Purchases'?['status','handoffs']:section==='Referrals'?['progress','inviters']:['timezone','devices']
  const titles:Record<string,string>={AttributionLedger:'Leading creator links',Authentication:'Identity links by platform',Purchases:'Handoff outcomes',Referrals:'Referral progress',Notifications:'Registered device distribution'}
  return <Panel title={titles[section]} description={ledger?'Net credited revenue, grouped by link.':section==='Referrals'?'Lifetime credited signups per inviter.':'Compare the observed groups at a glance.'} note={ledger?'Compare only one currency and credit model at a time. Direct and first-touch overlap. Up to eight leading links from the period; these are creator credit amounts, not provider-settled balances.':reports[section].note}>
    {ledger && currency?<div className="mb-6 flex flex-wrap gap-4"><AnalyticsSelect label="Currency" value={currency} onChange={setCurrency} options={currencies.map(value=>({value,label:value}))}/><AnalyticsSelect label="Credit" value={credit} onChange={setCredit} options={['Direct','First touch'].map(value=>({value,label:value}))}/></div>:null}
    <Bars format={ledger?value=>money(value,currency):undefined} rows={[...values].sort((a,b)=>Number(b[fields[1]])-Number(a[fields[1]])).slice(0,8).map(row=>({label:`${section==='Notifications'?`${row.environment} · `:''}${row[fields[0]]}`,value:row[fields[1]]==null?null:Number(row[fields[1]])}))}/>
  </Panel>
}
