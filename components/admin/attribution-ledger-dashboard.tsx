import {useState} from 'react'
import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import {AnalyticsSelect} from './analytics-select'
import {AnalyticsChart,chartColors} from './analytics-chart'
import {DataDetails,Notice,Panel,Stat,Table,count,money} from './analytics-ui'
import {operationalTime as time,operationalLabel as label} from './operational-format'
export function AttributionLedgerDashboard({data,days}:{data:AnalyticsDashboard;days:number}){
 const [credit,setCredit]=useState('direct'),[selectedCurrency,setCurrency]=useState('USD')
 const report=data.attributionLedger
 if(!report)return <Notice>Attribution ledger data is unavailable. Missing data is not shown as zero.</Notice>
 const currencies=[...new Set(report.summary.filter(row=>row.credit===credit).map(row=>String(row.currency)))].sort()
 const currency=currencies.includes(selectedCurrency)?selectedCurrency:currencies[0]??'USD'
 const summary=report.summary.find(row=>row.credit===credit&&row.currency===currency)
 const daily=report.daily.filter(row=>row.credit===credit&&row.currency===currency)
 const records=report.records.filter(row=>row.credit===credit&&row.currency===currency)
 return <>
  <div className="mb-5 flex flex-wrap gap-3"><AnalyticsSelect label="Credit model" value={credit} onChange={setCredit} options={[{value:'direct',label:'Direct credit'},{value:'first',label:'First-touch credit'}]}/><AnalyticsSelect label="Currency" value={currency} onChange={setCurrency} options={(currencies.length?currencies:['USD']).map(value=>({value,label:value}))}/></div>
  <p className="mb-5 text-sm leading-6 text-zinc-500">Audit recorded creator credit for {days===1?'the last 24 hours':`the last ${days} days`}. Direct and first-touch credit describe overlapping underlying events and must be reviewed separately. Currency totals remain separate.</p>
  <div className="admin-stats-grid"><Stat title="Credited payment records" value={count(summary?.payments??(report.summary.length===0?0:null))} note={`${count(summary?.records??0)} credit records across all event types · selected model and currency`}/><Stat title="Gross monetary credit" value={money(summary?.gross,currency)} note="Positive recorded payment credit · before reversals"/><Stat title="Refund and dispute reversals" value={money(summary?.reversals,currency)} note="Recorded reversals in this credit scope"/><Stat title="Net monetary credit" value={money(summary?.net,currency)} note="Recorded payments plus signed refunds and disputes · before fees and taxes"/></div>
  <Panel title="Credit record activity" description={`${days===1?'Hourly':'Daily'} ledger records · ${credit==='direct'?'direct':'first-touch'} credit · ${currency}`}
   note="Uses the same audience exclusions and timing policy as Creator Attribution. Billing-linked entries use normalized provider event time; unlinked or legacy entries use ledger creation time. Known internal, bot-linked and explicit sandbox credit are excluded. Legacy records without environment evidence remain included. Record counts include non-monetary milestones; they do not measure company revenue. Empty buckets are omitted and boundary buckets are partial.">
   <AnalyticsChart key={`${days}:${credit}:${currency}`} title="Credit record activity" rows={daily} metrics={[{key:'records',label:'Credit records',color:chartColors.blue}]} days={days}/>
   <DataDetails><Table rows={daily.map(row=>({...row,period:time(row.day)}))} columns={['period','records']}/></DataDetails>
  </Panel>
  <Panel title="Credit entry audit" description="Recent records with event timing, recorded timing and billing-link status."
   note="The list retains at most the latest 100 records per credit model and currency; all headline totals and the trend use the full period. Record references identify credit entries, not customer or payment credentials. Billing linkage establishes a recorded reference, not a reconciliation guarantee. Non-monetary rows have no monetary amount displayed. The Revenue page is the normalized billing view; Creator Attribution is the performance view.">
   <p className="text-sm leading-6 text-zinc-500">{count(summary?.records??0)} matching credit records. {count(records.length)} recent entries are available below. {count(summary?.billing_linked??0)} records have billing linkage; {count(summary?.legacy_money??0)} monetary-type records have no billing record linked.</p>
   <DataDetails><Table rows={records.map(row=>({record_reference:row.record_reference,event:label(row.event),creator:row.creator,handle:row.handle,amount:['payment','refund','dispute'].includes(String(row.event))?money(row.amount,currency):null,event_time:time(row.event_at),recorded_time:time(row.recorded_at),billing_link:row.billing_link}))} columns={['record_reference','event','creator','handle','amount','event_time','recorded_time','billing_link']}/></DataDetails>
  </Panel>
  <Panel title="Coverage and freshness" description="Credit timestamps and allocation coverage remain distinct from billing collection.">
   <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Latest credited event · selected scope',summary?.latest_event],['Latest credit record · selected scope',summary?.latest_record]].map(([title,value])=><div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
   <p className="mt-5 text-xs leading-5 text-zinc-500">{count(report.coverage[0]?.underlying_records)} underlying attribution records match the period before credit-model expansion. {count(report.coverage[0]?.unallocated_billing_records)} positive production billing records in this period have no allocated creator credit. Missing credit does not establish lost sales or zero creator impact.</p>
   <p className="mt-3 text-xs leading-5 text-zinc-500">Read-only snapshot checks every minute while visible and on focus, using a 60-second cache with background revalidation. Source timestamps do not guarantee complete attribution. Selected-period ledger credit is independent of creator compensation and company-wide net revenue.</p>
  </Panel>
 </>
}
