import {expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import {ReferralsDashboard} from './referrals-dashboard'
function snapshot():AnalyticsDashboard{
 return {generatedAt:'2026-10-27T22:00:00Z',filters:{days:'30',platform:'all',section:'Referrals'},referrals:{
  summary:[{signups:10,inviters:3,eligible:4,pending:6,mobile7:3,paywall7:2,viewed7:2,paid7:1}],daily:[],participation:[{contribution:'three_plus',inviters:3,credited_signups:10,eligible:4,viewed7:2,paid7:1}],
  rewards:[{period_records:2,available_credits:8,lifetime_records:12,completed_scans:5,latest_update:'2026-10-27T21:32:00'}],rewardKinds:[{kind:'legacy_signup',period_records:1,lifetime_records:8,available_credits:6}],activity:[{event_name:'referral_invite_created',events:50,devices:20,accounts:18}],coverage:[{latest_credited_signup:'2026-10-27T21:30:00'}],
 }} as unknown as AnalyticsDashboard
}
test('referral rates use mature credited accounts rather than invitations or immature signups',()=>{
 const html=renderToStaticMarkup(<ReferralsDashboard data={snapshot()} days={30}/>)
 expect(html).toContain('>50.0%</p>')
 expect(html).toContain('>25.0%</p>')
 expect(html).toContain('2 of 4 accounts with complete follow-up')
 expect(html).toContain('6 are awaiting the full window')
 expect(html).not.toContain('>10.0%</p>')
 expect(html).toContain('This is not a sequential funnel')
 expect(html).toContain('Zero-value trials, unknown amounts, refunds')
 expect(html).toContain('not a failed refresh')
})
test('reward creation, current balance and lifetime records retain different scopes and units',()=>{
 const html=renderToStaticMarkup(<ReferralsDashboard data={snapshot()} days={30}/>)
 for(const value of ['2','5','8','12'])expect(html).toContain(`>${value}</p>`)
 expect(html).toContain('Current unexpired stored balance · all grant dates')
 expect(html).toContain('Legacy per-signup reward')
 expect(html).toContain('reward holders are a separate population')
 expect(html).toContain('no cash payout, reward cost or financial return is inferred')
 expect(html).toContain('Period contribution bands do not establish lifetime reward eligibility')
 expect(html).toContain('2:32 PM PDT')
})
test('share attempts and notification sends never become delivered invitations or an acquisition denominator',()=>{
 const html=renderToStaticMarkup(<ReferralsDashboard data={snapshot()} days={30}/>)
 expect(html).toContain('Invite share starts')
 expect(html).toContain('emitted before the sharing action finishes')
 expect(html).toContain('must not be used as a referral conversion denominator')
 expect(html).toContain('signup provenance cannot be independently verified as production-only')
 expect(html).toContain('60-second cache')
})
test('immature or unavailable cohorts do not imply a measured zero outcome rate',()=>{
 const data=snapshot()
 data.referrals!.summary[0]={signups:5,inviters:2,eligible:0,pending:5,mobile7:0,paywall7:0,viewed7:0,paid7:0}
 const html=renderToStaticMarkup(<ReferralsDashboard data={data} days={1}/>)
 expect(html).toContain('No mature credited accounts in this period')
 expect(html).not.toContain('>0.0%</p>')
 expect(html).not.toContain('NaN')
 data.referrals=null
 expect(renderToStaticMarkup(<ReferralsDashboard data={data} days={1}/>)).toContain('Unavailable data is not shown as zero')
})
