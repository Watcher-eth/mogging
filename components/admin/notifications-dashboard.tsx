import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import {AnalyticsChart,chartColors} from './analytics-chart'
import {Bars,DataDetails,Notice,Panel,Stat,Table,count} from './analytics-ui'
import {operationalTime as time,operationalLabel as label} from './operational-format'
const environments:Record<string,string>={production:'APNs production',sandbox:'APNs sandbox',fcm:'FCM · environment not classified'}
const kinds:Record<string,string>={protocol:'Protocol reminder',invite:'Referral invitation reminder',referral_reward:'Referral reward notification'}
export function NotificationsDashboard({data,days}:{data:AnalyticsDashboard;days:number}){
 const report=data.notifications
 if(!report)return <Notice>Notification reporting is unavailable. Missing data is not shown as zero.</Notice>
 const summary=report.summary[0],coverage=report.coverage[0]
 const maximum=Math.max(4,Math.ceil(Math.max(0,...report.kinds.map(row=>Number(row.records)))/4)*4)
 return <>
  <p className="mb-5 text-xs leading-5 text-zinc-500">{days===1?'Last 24 hours':`Last ${days} days`} · All registration environments · Known internal accounts excluded · Pacific time</p>
  <div className="admin-stats-grid"><Stat title="Registered accounts" value={count(summary?.accounts)} note={`${count(summary?.endpoints)} stored endpoints · current registrations, including sandbox`}/><Stat title="Accounts with current sessions" value={count(summary?.current_sessions)} note="Latest registration per account · session not expired · not confirmed reachable"/><Stat title="Reminder records retained" value={count(summary?.records)} note={`${count(summary?.record_accounts)} accounts · selected period · all environments`}/><Stat title="Devices opening notifications" value={count(summary?.openers)} note={`${count(summary?.opens)} observed production customer open events · selected period`}/></div>
  {days>35?<Notice>Reminder records are pruned after 35 days. This longer window cannot provide complete reminder history; registrations remain a current snapshot.</Notice>:null}
  <Panel title="Notification engagement" description={`${days===1?'Hourly':'Daily'} distinct devices with an observed notification open`}
   note="Source: production customer push_opened client events. Known internal identities and explicit sandbox activity are excluded. Opens are not linked to individual reminder records, so an open rate or delivery rate cannot be measured here. Daily device counts overlap and cannot be summed into period totals. Missing observations on older clients do not establish non-use. Empty buckets are omitted and boundary buckets are partial.">
   <AnalyticsChart key={days} title="Notification engagement" rows={report.daily} metrics={[{key:'openers',label:'Opening devices',color:chartColors.blue}]} days={days}/>
   <DataDetails><Table rows={report.daily.map(row=>({...row,period:time(row.day)}))} columns={['period','openers','opens']}/></DataDetails>
  </Panel>
  <Panel title="Reminder activity by type" description="Retained send-claim records created in the selected period."
   note="The send process reserves a record before contacting the provider. Records can represent accepted sends, in-flight work or ambiguous transport failures; rejected sends normally remove their claim. A retained claim does not prove device delivery. Records lack an environment field and include all environments. Counts are records, not unique notifications received, and older records are pruned after 35 days.">
   <Bars animated maximum={maximum} labelWidth={230} rows={report.kinds.map(row=>({label:kinds[String(row.kind)]??label(row.kind),value:Number(row.records),detail:`${count(row.accounts)} accounts · account counts can overlap types`}))}/>
   <DataDetails><Table rows={report.kinds.map(row=>({...row,kind:kinds[String(row.kind)]??label(row.kind)}))} columns={['kind','records','accounts']}/></DataDetails>
  </Panel>
  <Panel title="Current registrations" description="Stored endpoints by push service. Independent of the period filter."
   note="Production and sandbox label the APNs endpoint. FCM identifies the Android push service without independently establishing a production or test installation. A registered token and a valid session do not prove permission, token validity, schedule eligibility or device reachability. The scheduler selects the latest registration per account. Account counts can overlap service rows; the headline account total is independently deduplicated. No device tokens or account identifiers are exposed.">
   <Table rows={report.registrations.map(row=>({...row,service:environments[String(row.environment)]??label(row.environment),latest_update:time(row.latest_update)}))} columns={['service','endpoints','accounts','valid_sessions','latest_update']}/>
  </Panel>
  <Panel title="Data sources and freshness" description="Registration state, retained reminder records and client observations.">
   <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Latest registration update',coverage?.latest_registration],['Latest open received',coverage?.latest_receipt]].map(([title,value])=><div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
   <p className="mt-5 text-xs leading-5 text-zinc-500">Checks every minute while visible and on return to this tab, with a 60-second cache and background revalidation. Registration and reminder records use all environments; opening-device metrics use production customer analytics. Event time and receipt time are separate. Source timestamps do not establish delivery or complete collection.</p>
   <DataDetails><Table rows={[{source:'Latest reminder record retained in the period',observed:time(coverage?.latest_record)},{source:'Latest observed notification open',observed:time(coverage?.latest_open)}]} columns={['source','observed']}/></DataDetails>
  </Panel>
 </>
}
