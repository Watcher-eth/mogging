import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import {formatReportingTime} from '@/lib/admin/reporting-time'
import {AnalyticsChart,chartColors,type ChartMetric} from './analytics-chart'
import {Bars,DataDetails,Notice,Panel,Stat,Table,count,percent,label} from './analytics-ui'

const metrics:ChartMetric[]=[{key:'signups',label:'Credited signups',color:chartColors.blue}]
const contributions:Record<string,string>={one:'One credited signup',two:'Two credited signups',three_plus:'Three or more credited signups'}
const rewardNames:Record<string,string>={one_time:'One-time referral reward',legacy_signup:'Legacy per-signup reward',revoked:'Revoked reward record',other:'Other referral reward record'}
const activityNames:Record<string,string>={referral_invite_opened:'Invite flow opens',referral_invite_created:'Invite share starts',referral_reward_notification_sent:'Recorded reward notification sends'}
const time=(value:unknown)=>typeof value==='string'?formatReportingTime(value,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'No record available'

export function ReferralsDashboard({data,days}:{data:AnalyticsDashboard;days:number}){
 const report=data.referrals
 if(!report)return <Notice>Referral reporting could not be established from this snapshot. Unavailable data is not shown as zero.</Notice>
 const summary=report.summary[0],rewards=report.rewards[0],coverage=report.coverage[0]
 const eligible=Number(summary?.eligible)
 const outcomes=[{label:'Mobile activity observed',accounts:Number(summary?.mobile7)},{label:'Paywall reached',accounts:Number(summary?.paywall7)},{label:'Own report viewed',accounts:Number(summary?.viewed7)},{label:'Positive payment recorded',accounts:Number(summary?.paid7)}]
 return <>
  <p className="mb-5 text-xs leading-5 text-zinc-500">{days===1?'Last 24 hours':`Last ${days} days`} · Customer referral program · All platforms · Pacific time</p>
  <div className="admin-stats-grid">
   <Stat title="Credited signups" value={count(summary?.signups)} note="Distinct referred accounts credited in the selected period"/>
   <Stat title="Referring accounts" value={count(summary?.inviters)} note="Accounts credited with at least one referral signup in this period"/>
   <Stat title="Report viewed within 7 days" value={percent(Number(summary?.viewed7),eligible)} note={eligible>0?`${count(summary?.viewed7)} of ${count(eligible)} accounts with complete follow-up · client-observed`:'No mature credited accounts in this period'}/>
   <Stat title="Paying within 7 days" value={percent(Number(summary?.paid7),eligible)} note={eligible>0?`${count(summary?.paid7)} of ${count(eligible)} eligible accounts · positive production charge`:'No mature credited accounts in this period'}/>
  </div>
  <p className="mb-5 text-sm leading-6 text-zinc-500">{count(summary?.eligible)} credited accounts have a complete seven-day follow-up. {count(summary?.pending)} are awaiting the full window and are excluded from the outcome rates. Customer referral scan rewards are separate from the creator referral program.</p>
  <Panel title="Referral signup trend" description={`${days===1?'Hourly':'Daily'} accounts credited to a customer referral`}
   note="Source: the referral signup ledger, grouped by credit-record creation time in Pacific time. Each referred account can be credited once. Known internal inviters and referred accounts are excluded; claimed guest inviter identities are consolidated and self-referrals are excluded. Empty buckets show zero recorded credits, not zero invite activity or complete attribution. Boundary buckets are partial. The ledger has no runtime-environment field, so signup provenance cannot be independently verified as production-only.">
   {Number(summary?.signups)>0?<AnalyticsChart key={days} title="Referral signup trend" rows={report.daily} metrics={metrics} days={days}/>:<p className="admin-empty">No referral signups were credited in this period.</p>}
   <DataDetails><Table rows={report.daily.map(row=>({period:time(row.day),credited_signups:row.signups}))} columns={['period','credited_signups']}/></DataDetails>
  </Panel>
  <Panel title="Seven-day referral outcomes" description="Accounts with a complete seven-day follow-up. Each outcome is measured independently."
   note="Every row uses referred accounts credited in the selected period with at least 168 hours of follow-up. Events must occur at or after referral credit and strictly before credit plus seven days. This is not a sequential funnel: accounts can reach different outcomes without every earlier event being observed. Mobile activity requires an account-linked customer event on iOS/Android; it does not verify an install. Own-report viewing matches an account-linked client view to its own currently completed, user-submitted report, excluding known internal/sandbox report records. Payments require a positive recorded production charge linked to the referred account, including qualifying renewals. Zero-value trials, unknown amounts, refunds and billing status changes do not qualify. A later refund does not erase the historical positive-charge observation. Counts are accounts across currencies, not revenue, current subscribers or incremental acquisition impact.">
   {eligible>0?<Bars animated maximum={100} format={value=>`${value.toFixed(1)}%`} labelWidth={210} rows={outcomes.map(row=>({label:row.label,value:row.accounts/eligible*100,detail:`${count(row.accounts)} of ${count(eligible)} eligible accounts · ${percent(row.accounts,eligible)}`}))}/>:<p className="admin-empty">No credited accounts in this period have a complete seven-day follow-up. A longer reporting period may include mature cohorts.</p>}
   <DataDetails><Table rows={eligible>0?outcomes.map(row=>({outcome:row.label,accounts:row.accounts,eligible,rate:percent(row.accounts,eligible)})):[]} columns={['outcome','accounts','eligible','rate']}/></DataDetails>
  </Panel>
  <Panel title="Referral participation" description="How credited signups are distributed across referring accounts in this period."
   note="Bands use signups credited within the selected period. Inviter aliases claimed by a registered account are consolidated. Mature outcomes use only the same complete seven-day cohorts as the headline rates. Period contribution bands do not establish lifetime reward eligibility. No personal names, invite codes or account identifiers are exposed.">
   <Table rows={report.participation.map(row=>({contribution:contributions[String(row.contribution)]??label(String(row.contribution)),referring_accounts:row.inviters,credited_signups:row.credited_signups,eligible_accounts:row.eligible,report_viewed_within_7_days:row.viewed7,paying_within_7_days:row.paid7}))} columns={['contribution','referring_accounts','credited_signups','eligible_accounts','report_viewed_within_7_days','paying_within_7_days']}/>
  </Panel>
  <Panel title="Referral scan rewards" description="Reward records created in the period and the current available credit balance."
   note="Source: stored customer referral reward entitlements. The current program grants a one-time scan credit after three credited signups; legacy per-signup and revoked records remain separate. Record counts are not unique rewarded people or verified credit consumption. Completed reward evaluations count successful backend requests authorized by referral credits and begun in the selected period; reward holders are a separate population from the referred-account cohorts above. They can include repeat evaluations or reused reports. Current available credits sum positive stored balances on unexpired, non-refunded/non-disputed referral rewards, excluding revoked records and known internal/sandbox entitlements. This balance includes earlier grants and is independent of the period filter. Zero remaining balance does not establish that a scan completed. These are scan credits; no cash payout, reward cost or financial return is inferred.">
   <div className="admin-stats-grid"><Stat title="Reward records created" value={count(rewards?.period_records)} note="Selected period · includes legacy and currently revoked records"/><Stat title="Completed reward evaluations" value={count(rewards?.completed_scans)} note="Successful requests using referral credits · selected period"/><Stat title="Available reward credits" value={count(rewards?.available_credits)} note="Current unexpired stored balance · all grant dates"/><Stat title="All-time reward records" value={count(rewards?.lifetime_records)} note="All known referral reward records through this snapshot"/></div>
   <DataDetails><Table rows={report.rewardKinds.map(row=>({...row,reward_type:rewardNames[String(row.kind)]??label(String(row.kind))}))} columns={['reward_type','period_records','lifetime_records','available_credits']}/></DataDetails>
  </Panel>
  <Panel title="Invite activity" description="Supporting observations from the selected period, across all platforms."
   note="Invite flow opens are observed entry into the invite flow. Invite share starts are button selections emitted before the sharing action finishes; they do not prove a unique link was created, an invitation was delivered, or a recipient clicked it. Repeats are included. Server notification sends do not prove device delivery. These observations are not matched to the credited-signup cohort and must not be used as a referral conversion denominator. Device and account counts are deduplicated within each event only and can overlap.">
   <Table rows={report.activity.map(row=>({activity:activityNames[String(row.event_name)]??label(String(row.event_name)),events:row.events,devices:row.event_name==='referral_reward_notification_sent'?null:row.devices,accounts:row.accounts}))} columns={['activity','events','devices','accounts']}/>
  </Panel>
  <Panel title="Data sources and freshness" description="Snapshot timing, credited referrals and reward-balance updates.">
   <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Latest credited signup · all time',coverage?.latest_credited_signup],['Latest reward update · all time',rewards?.latest_update]].map(([title,value])=><div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
   <p className="mt-5 text-xs leading-5 text-zinc-500">Sources: credited customer referrals, account-linked client analytics, normalized production billing, saved user reports and reward entitlements. Checks every minute while visible and on return to this tab; snapshots use a 60-second cache with background revalidation. Referral credits and reward records have no reliable platform field, so this report uses all platforms. Missing identity links or older tracking can leave product use unobserved. Billing without a linked account cannot be assigned to this cohort. Legacy records without environment evidence remain included where noted.</p>
   <DataDetails><Table rows={[
    {measurement:'Latest observed activity from referred accounts in the period cohort',value:time(coverage?.latest_referred_activity)},
    {measurement:'Latest cohort activity received',value:time(coverage?.latest_referred_receipt)},
    {measurement:'Latest matching cohort billing record received',value:time(coverage?.latest_billing_receipt)},
    {measurement:'Payment-type records with unknown amounts · mature seven-day windows',value:coverage?.unknown_amount_records??null},
    {measurement:'Latest invite activity event',value:time(coverage?.latest_invite_event)},
    {measurement:'Latest invite activity received',value:time(coverage?.latest_invite_receipt)},
   ]} columns={['measurement','value']}/><p className="mt-3 text-xs leading-5 text-zinc-500">No matching source timestamp means no matching observation, not a failed refresh. Source timestamps do not establish complete attribution or collection.</p></DataDetails>
  </Panel>
 </>
}
