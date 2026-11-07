import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { webJourneyCTEs } from '../../lib/admin/web-journey-query'
import { WEB_FLOW_VERSION } from '../../lib/analytics/web-context'
const address=process.env.WEB_JOURNEY_TEST_DATABASE_URL!
const url=new URL(address)
if(url.hostname!=='127.0.0.1'||url.port!=='55448'||url.pathname!=='/web_journey_test')throw Error('Use the isolated localhost web_journey_test database on port 55448')
const db=postgres(address,{max:1,prepare:false})
try{
 await db.unsafe(`create temporary table e(event_name text,platform text,source text,properties jsonb,session_id text,account_id text,occurred_at timestamp,received_at timestamp);
 create temporary table subscription_events(provider text,environment text,event_name text,properties jsonb,occurred_at timestamp,received_at timestamp);
 create temporary table payment_entitlements(id text,stripe_checkout_session_id text,created_at timestamp);
 create temporary table scan_reservations(user_id text,status text,created_at timestamp);`)
 const base=Date.parse('2026-10-01T00:00:00Z')
 async function event(flow:string,event_name:string,minutes:number,properties:Record<string,unknown>={},platform='web',session:string|null=null,account:string|null=null){
  const at=new Date(base+minutes*60000).toISOString()
  await db`insert into e values(${event_name},${platform},${platform==='server'?'web_analysis':'web'},${db.json({flow_id:flow,flow_version:WEB_FLOW_VERSION,surface:'web_analysis',path:'/analysis',browser_family:'chrome',device_platform:'desktop',...properties})},${session},${account},${at},${at})`
 }
 async function receipt(session:string,event_name:string,minutes:number){const at=new Date(base+minutes*60000).toISOString();await db`insert into subscription_events values('stripe','production',${event_name},${db.json({checkout_session_id:session})},${at},${at})`}
 await event('paid','onboarding_step_viewed',0,{step:'profile.motivation'})
 await event('paid','onboarding_step_completed',.5,{step:'profile.motivation'})
 await event('paid','paywall_viewed',1)
 await event('paid','purchase_started',2,{attempt_id:'attempt-paid'})
 // The device clock can be ahead of the server. Exact checkout/attempt links own ordering.
 await event('paid','checkout_started',1.8,{attempt_id:'attempt-paid',product:'monthly'},'server','cs_paid','buyer')
 await receipt('cs_paid','checkout_confirmed',3)
 await receipt('cs_paid','checkout_confirmed',3) // Duplicate delivery must not create a second buyer/session.
 await db`insert into payment_entitlements values('credit','cs_paid','2026-10-01')`
 await event('paid','purchase_cancelled',4,{attempt_id:'attempt-paid'})
 await event('paid','evaluation_request_completed',5,{report_id:'report-one'},'server',null,'buyer')
 await event('paid','evaluation_request_completed',5,{report_id:'report-one'},'server',null,'buyer')
 await event('paid','report_viewed',5.5,{report_id:'report-one'},'web',null,'buyer')
 await db`insert into scan_reservations values('buyer','complete','2026-10-01T00:05:00Z')`
 await event('paid','progress_viewed',1500,{},'web',null,'buyer')
 await event('paid','protocol_viewed',10100,{},'web',null,'buyer')
 await event('fake','paywall_viewed',10)
 await event('fake','purchase_started',11,{attempt_id:'attempt-fake'})
 await event('fake','checkout_started',12,{attempt_id:'attempt-fake'},'server','cs_fake','other')
 await event('fake','checkout_completed',13,{attempt_id:'attempt-fake'})
 await receipt('cs_fake','checkout_expired',14)
 await event('unlinked','onboarding_step_viewed',0,{step:'intro'})
 await event('unlinked','checkout_started',1,{attempt_id:'missing-browser-path'},'server','cs_unlinked','buyer-two')
 await receipt('cs_unlinked','one_time_purchase',2)
 await event('existing','onboarding_step_viewed',0,{step:'upload'})
 await event('existing','purchase_started',1,{attempt_id:'existing-attempt'})
 await event('existing','purchase_reconciled',2,{attempt_id:'existing-attempt',result:'existing_access'})
 await event('existing','evaluation_request_completed',3,{report_id:'existing-report'},'server')
 await event('old','paywall_viewed',1,{flow_version:null})
 const query=(version:string)=>{const q=new PgDialect().sqlToQuery(webJourneyCTEs('2026-10-01T00:00:00Z','2026-10-15T00:00:00Z',14,version,'browser'));return db.unsafe(`with ${q.sql} select report from web_journey`,q.params as any[])}
 const [result]=await query(WEB_FLOW_VERSION);const r=result.report;const s=r.summary[0]
 assert.equal(s.journeys,4);assert.equal(s.paid_journeys,1);assert.equal(s.evaluated,1);assert.equal(s.report_viewed,1)
 assert.equal(s.verified_paid_sessions,2);assert.equal(s.paid_without_ordered_browser_path,1)
 assert.equal(s.existing_access_journeys,1);assert.equal(s.all_server_evaluated,2)
 assert.deepEqual(r.funnel.map((x:any)=>x.journeys),[4,2,2,2,1,1,1,1])
 assert(r.outcomes.some((x:any)=>x.outcome==='Stripe payment verified'&&x.attempts===1))
 assert(r.outcomes.some((x:any)=>x.outcome==='Stripe checkout expired'&&x.attempts===1))
 assert.deepEqual(r.postPurchase[0],{paid_accounts:2,accounts_evaluated:1,d1_eligible:2,d7_eligible:2,d1_returned:1,d7_returned:1})
 assert.equal(r.steps[0].completed,1)
 const [legacy]=await query('legacy');assert.equal(legacy.report.summary[0].journeys,1)
 console.log('PASS: ordered web funnel, server-only payment proof, duplicate receipts, clock skew, legacy isolation, existing access, missing browser path, mature D1/D7 follow-up')
}finally{await db.end()}
