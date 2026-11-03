import { AnalyticsLink } from './analytics-link'
import type {PurchaseBehavior} from '@/lib/admin/purchase-behavior'
import {TimeBars} from './time-bars'
import {chartColors} from './analytics-chart'
import {Bars,DataDetails,Notice,Panel,Stat,Table,count,percent} from './analytics-ui'

const names:Record<string,string>={single_scan:'Single scans',scan_bundle:'Scan bundles',subscription:'Subscription payments',other:'Other / unclassified',single_only:'Single scans only',bundle_only:'Bundles only',single_and_bundle:'Singles and bundles',subscription_only:'Subscription only',scans_and_subscription:'Scans and subscription'}
const sourceMetrics=[{key:'app_store',label:'Apple App Store',color:chartColors.blue},{key:'stripe',label:'Stripe / web',color:chartColors.violet},{key:'google_play',label:'Google Play',color:chartColors.green},{key:'other',label:'Other store',color:chartColors.orange}]
const timing:Record<string,string>={'1':'Under 1 day','3':'1–3 days','7':'3–7 days','14':'7–14 days','15':'14+ days'}
export function PurchaseBehaviorDashboard({report,days,activity=true}:{report:PurchaseBehavior|null|undefined;days:number;activity?:boolean}) {
  if(!report)return <Notice>Billing-confirmed purchase behavior is unavailable in this snapshot.</Notice>
  const summary=report.summary[0],firstBuyers=Number(summary?.first_buyers??0),timingBuyers=Number(summary?.timing_linked_first_buyers??0)
  return <>
    {Number(summary?.unpriced_events)>0?<Notice>{count(summary?.unpriced_events)} purchase-related billing events have no recorded amount and are excluded from paid-purchase counts until their charge can be established.</Notice>:null}
    {activity?<>
      <div className="admin-stats-grid">
        <Stat title="Paid purchases" value={count(summary?.purchases)} note={`${count(summary?.renewals)} subscription renewals included · all payment sources`}/>
        <Stat title="Paying customers" value={count(summary?.buyers)} note="Distinct linked billing identities in the selected period"/>
        <Stat title="Single scans / bundles" value={`${count(summary?.single_scans)} / ${count(summary?.bundles)}`} note="Purchase transactions, not scan credits or people"/>
        <Stat title="Repeat scan buyers" value={count(summary?.repeat_scan_buyers)} note="Period buyers with 2+ scan orders in their recorded history"/>
      </div>
      <Panel title="Purchase activity" description={`${days===1?'Hourly':'Daily'} paid transactions · all stores and web · Pacific time`}
        note="Positive production billing transactions from Stripe and RevenueCat, deduplicated by provider and transaction ID (provider event ID if no transaction ID exists). Includes subscription renewals; excludes zero-charge trials, refunds, refund reversals, status updates and client-only completion events. All sources are included regardless of the mobile platform filter. Calendar buckets with no recorded transactions show zero; this does not guarantee provider coverage. Partial boundary buckets are included.">
        <TimeBars title="Paid purchases" rows={report.daily} metrics={sourceMetrics} days={days}/>
        <DataDetails><Table rows={report.daily} columns={['day','purchases','app_store','stripe','google_play','other']}/></DataDetails>
      </Panel>
    </>:null}
    {activity && report.sources?.length ? <Panel title="Compare payment channels" description="The same paid-sale definition across stores and web"
      note="Apple App Store and Google Play are payment channels reported by RevenueCat. Stripe is web checkout, including people who arrive from the mobile app. Channel is not device platform. Renewals count as payments, not new customers. Customer counts overlap when one linked account uses several channels; combined customers above are deduplicated.">
      <Table rows={report.sources.map(row => ({channel:sourceMetrics.find(source=>source.key===row.payment_source)?.label ?? 'Other store',paid_purchases:row.purchases,paying_customers:row.buyers,first_time_customers:row.first_buyers,single_scans:row.single_scans,bundles:row.bundles,subscription_payments:row.subscription_payments,renewals:row.renewals}))} columns={['channel','paid_purchases','paying_customers','first_time_customers','single_scans','bundles','subscription_payments','renewals']} />
      <p className="mt-4 text-sm text-zinc-500">Revenue, refunds and fees use these same billing records, with each currency kept separate. <AnalyticsLink className="font-medium text-zinc-900 underline underline-offset-4" href={{pathname:'/admin/analytics/revenue',query:{days:String(days)}}}>Open revenue →</AnalyticsLink></p>
    </Panel> : null}
    {Number(summary?.unidentified_purchases)>0?<Notice>{count(summary?.unidentified_purchases)} paid transactions have no billing identity. They appear in purchase totals but cannot be counted as people or placed in buyer cohorts.</Notice>:null}
    <Panel title="What people buy" description="Selected-period purchases and buyers · all payment sources"
      note="A bundle is one transaction and grants several credits. Buyers can appear in more than one product row. Subscription payments include renewals, shown separately; zero-price trials are excluded. Refunds do not erase the historical fact of a purchase; net financial impact is reported on Revenue. Unknown products remain unclassified.">
      <Bars labelWidth={180} rows={report.products.map(r=>({label:names[String(r.kind)]??String(r.kind),value:Number(r.purchases),detail:`${count(r.buyers)} buyers · ${count(r.renewals)} renewals`}))}/>
      <DataDetails><Table rows={report.products.map(r=>({...r,product:names[String(r.kind)]??r.kind}))} columns={['product','purchases','buyers','renewals','unidentified_purchases']}/></DataDetails>
    </Panel>
    <Panel title="Repeat buyers and product combinations" description="People who paid in the selected period · their full recorded purchase history"
      note="Frequency counts single-scan and bundle transactions, not credits. Subscription renewals do not increase scan-order frequency. Combination groups are mutually exclusive; people with subscriptions and scans appear only in Scans and subscription. Identities are unified across providers only when linked to the same account; unlinked provider identities cannot be proven to represent different people.">
      <div className="grid gap-8 lg:grid-cols-2"><div><h3 className="mb-4 text-sm font-medium">How many scan orders?</h3><Bars rows={report.frequency.map(r=>({label:`${r.scan_orders} scan ${r.scan_orders==='1'?'order':'orders'}`,value:Number(r.buyers),detail:`${count(r.also_subscription)} also paid for a subscription`}))}/></div>
        <div><h3 className="mb-4 text-sm font-medium">What else did they buy?</h3><Bars labelWidth={190} color={chartColors.violet} rows={report.combinations.map(r=>({label:names[String(r.combination)]??String(r.combination),value:Number(r.buyers)}))}/></div></div>
      <DataDetails><Table rows={report.frequency} columns={['scan_orders','buyers','also_subscription']}/><Table rows={report.combinations.map(r=>({...r,combination:names[String(r.combination)]??r.combination}))} columns={['combination','buyers']}/></DataDetails>
    </Panel>
    <Panel title="When people first buy" description="Time from account creation to first recorded paid purchase"
      note="The distribution includes first-time buyers whose first recorded payment occurred in the selected period and whose payment is linked to an account created before that payment. These exclusive buckets describe buyers, not conversion rates. Account creation is not installation or first paywall exposure. Earlier purchases outside our recorded billing history cannot be reconstructed.">
      <Bars labelWidth={160} rows={report.firstPurchase.map(r=>({label:timing[String(r.bucket)]??String(r.bucket),value:Number(r.buyers),detail:`${percent(Number(r.buyers),timingBuyers)} of buyers with known signup timing`}))}/>
      <p className="mt-4 text-xs text-zinc-500">Timing available for {count(timingBuyers)} of {count(firstBuyers)} first-time billing identities. Others remain outside this distribution.</p>
      <DataDetails><Table rows={report.firstPurchase.map(r=>({window:timing[String(r.bucket)]??r.bucket,buyers:r.buyers}))} columns={['window','buyers']}/></DataDetails>
    </Panel>
    <Panel title="Purchase within 1, 3, 7 or 14 days" description="New accounts created in the selected period · cumulative first-purchase conversion"
      note="Each window uses only accounts old enough to have the entire follow-up period by this snapshot. Purchases must occur after account creation and before the window ends. Pending accounts are excluded, not counted as failures. These signup cohorts include all non-internal accounts, not anonymous installs; zero eligible accounts means the rate is unavailable. Different windows can have different denominators.">
      <Bars maximum={100} format={v=>`${v.toFixed(1)}%`} rows={report.signupWindows.map(r=>({label:`Within ${r.window_days} ${Number(r.window_days)===1?'day':'days'}`,value:Number(r.eligible)>0?Number(r.buyers)/Number(r.eligible)*100:null,detail:`${count(r.buyers)} buyers / ${count(r.eligible)} eligible · ${count(r.pending)} still maturing`}))}/>
      {report.signupWindows.filter(r=>Number(r.eligible)===0).map(r=><p key={String(r.window_days)} className="mt-2 text-xs text-zinc-500">Within {r.window_days} {Number(r.window_days)===1?'day':'days'}: no eligible accounts yet · {count(r.pending)} still maturing.</p>)}
      <DataDetails><Table rows={report.signupWindows.map(r=>({...r,purchase_rate:percent(Number(r.buyers),Number(r.eligible))}))} columns={['window_days','accounts','eligible','pending','buyers','purchase_rate']}/></DataDetails>
    </Panel>
    <Panel title="What happens after the first purchase?" description="First-time buyers in the selected period · repeat scans and later subscriptions"
      note="Windows begin at the first recorded paid transaction and include only buyers with full follow-up. A later single-scan or bundle payment counts as a repeat scan order. An initial paid subscription after that first payment counts as a later subscription; automatic renewal events do not. Purchases at exactly the same timestamp are not classified as later. The two outcomes can overlap and are not a sequential funnel.">
      <Table rows={report.repeatWindows.map(r=>({within:`${r.window_days} ${Number(r.window_days)===1?'day':'days'}`,eligible_buyers:r.eligible,pending:r.pending,repeat_scan_buyers:r.repeat_scan_buyers,repeat_scan_rate:percent(Number(r.repeat_scan_buyers),Number(r.eligible)),later_subscribers:r.later_subscribers,later_subscription_rate:percent(Number(r.later_subscribers),Number(r.eligible))}))} columns={['within','eligible_buyers','pending','repeat_scan_buyers','repeat_scan_rate','later_subscribers','later_subscription_rate']}/>
    </Panel>
  </>
}
