import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { paywallExperimentCTEs } from '../../lib/admin/paywall-experiments'
import { webJourneyCTEs } from '../../lib/admin/web-journey-query'
import { WEB_ANALYSIS_CREATOR_COUPON } from '../../lib/payments/web-analysis-plans'
import { WEB_FLOW_VERSION } from '../../lib/analytics/web-context'
const address=process.env.WEB_JOURNEY_TEST_DATABASE_URL!
const url=new URL(address)
if(url.hostname!=='127.0.0.1'||url.port!=='55448'||url.pathname!=='/web_journey_test')throw Error('Use the isolated localhost web_journey_test database on port 55448')
const db=postgres(address,{max:1,prepare:false})
try{
 await db.unsafe(`create temporary table reported_events(event_name text,platform text,source text,properties jsonb,session_id text,account_id text,occurred_at timestamp,received_at timestamp,actor text);
 create temporary view e as select * from reported_events where platform='web';
 create temporary table subscription_events(provider text,environment text,event_name text,properties jsonb,occurred_at timestamp,received_at timestamp);
 create temporary table payment_entitlements(id text,stripe_checkout_session_id text,created_at timestamp);
 create temporary table scan_reservations(user_id text,status text,created_at timestamp);`)
 const base=Date.parse('2026-10-01T00:00:00Z')
 async function event(flow:string,event_name:string,minutes:number,properties:Record<string,unknown>={},platform='web',session:string|null=null,account:string|null=null,source=platform==='server'?'web_analysis':'web'){
  const at=new Date(base+minutes*60000).toISOString()
  await db`insert into reported_events values(${event_name},${platform},${source},${db.json({flow_id:flow,flow_version:WEB_FLOW_VERSION,surface:'web_analysis',path:'/analysis',browser_family:'chrome',device_platform:'desktop',...properties})},${session},${account},${at},${at},${platform === 'web' ? flow : null})`
 }
 async function receipt(session:string,event_name:string,minutes:number,properties:Record<string,string>={}){const at=new Date(base+minutes*60000).toISOString();await db`insert into subscription_events values('stripe','production',${event_name},${db.json({checkout_session_id:session,...properties})},${at},${at})`}
 await event('paid','attribution_diagnostic',0,{path:'/r/fixture',action:'creator_landing_viewed',surface:'creator_landing'})
 await event('paid','onboarding_step_viewed',0,{step:'profile.motivation',analysis_variant:'desktop_photo_offer_v1'})
 await event('paid','onboarding_step_completed',.5,{step:'profile.motivation'})
 await event('paid','paywall_viewed',1)
 await event('paid','purchase_started',2,{attempt_id:'attempt-paid'})
 // The device clock can be ahead of the server. Exact checkout/attempt links own ordering.
 await event('paid','checkout_started',1.8,{attempt_id:'attempt-paid',product:'monthly'},'server','cs_live_paid','buyer')
 await receipt('cs_live_paid','checkout_confirmed',3,{creator_discount:WEB_ANALYSIS_CREATOR_COUPON})
 await receipt('cs_live_paid','checkout_confirmed',3,{creator_discount:WEB_ANALYSIS_CREATOR_COUPON}) // Duplicate delivery must not create a second buyer/session.
 // Older verified receipts can lack a journey ID. The exact session still links them.
 await event('paid','checkout_completed',3,{flow_id:null,mode:'subscription'},'server','cs_live_paid','buyer','stripe_verified')
 await db`insert into payment_entitlements values('credit','cs_live_paid','2026-10-01')`
 await event('paid','purchase_cancelled',4,{attempt_id:'attempt-paid'})
 await event('paid','evaluation_request_completed',5,{report_id:'report-one'},'server',null,'buyer')
 await event('paid','evaluation_request_completed',5,{report_id:'report-one'},'server',null,'buyer')
 await event('paid','report_viewed',5.5,{report_id:'report-one'},'web',null,'buyer')
 await db`insert into scan_reservations values('buyer','complete','2026-10-01T00:05:00Z')`
 await event('paid','progress_viewed',1500,{},'web',null,'buyer')
 await event('paid','protocol_viewed',10100,{},'web',null,'buyer')
 await event('fake','paywall_viewed',10)
 await event('fake','purchase_started',11,{attempt_id:'attempt-fake'})
 await event('fake','checkout_started',12,{attempt_id:'attempt-fake'},'server','cs_live_fake','other')
 await event('fake','checkout_completed',13,{attempt_id:'attempt-fake'})
 await receipt('cs_live_fake','checkout_expired',14)
 await event('unlinked','landing_viewed',0,{path:'/'})
 await event('unlinked','onboarding_step_viewed',0,{step:'intro'})
 await event('unlinked','checkout_started',1,{attempt_id:'missing-browser-path'},'server','cs_live_unlinked','buyer-two')
 await receipt('cs_live_unlinked','one_time_purchase',2)
 await event('existing','onboarding_step_viewed',0,{step:'upload',device_platform:'ios',web_surface:'mobile_web'})
 await event('existing','purchase_started',1,{attempt_id:'existing-attempt'})
 await event('existing','purchase_reconciled',2,{attempt_id:'existing-attempt',result:'existing_access'})
 await event('existing','evaluation_request_completed',3,{report_id:'existing-report'},'server')
 await event('old','paywall_viewed',1,{flow_version:null})
 const query=(version:string)=>{const q=new PgDialect().sqlToQuery(webJourneyCTEs('2026-10-01T00:00:00Z','2026-10-15T00:00:00Z',14,version,'browser'));return db.unsafe(`with ${q.sql} select report from web_journey`,q.params as any[])}
 const [result]=await query(WEB_FLOW_VERSION);const r=result.report;const s=r.summary[0]
 assert.equal(s.landing_visitors,2);assert.equal(s.paid_landing_visitors,2);assert.equal(s.subscribed_landing_visitors,1);
 assert.equal(s.journeys,4);assert.equal(s.paid_journeys,1);assert.equal(s.evaluated,1);assert.equal(s.report_viewed,1)
 assert.equal(s.verified_paid_sessions,2);assert.equal(s.paid_without_ordered_browser_path,1)
 assert.equal(s.existing_access_journeys,1);assert.equal(s.all_server_evaluated,2)
 assert.equal(s.analysis_opened,3);assert.equal(s.analysis_paywalls,1)
 assert.equal(s.paid_analysis,2);assert.equal(s.subscribed_analysis,1)
 assert.deepEqual(r.funnel.map((x:any)=>x.journeys),[4,2,2,2,1,1,1,1])
 assert(r.outcomes.some((x:any)=>x.channel==='desktop_web'&&x.outcome==='Stripe payment verified'&&x.attempts===2))
 assert(r.channels.some((x:any)=>x.channel==='mobile_web'&&x.capture_opened===1&&x.paid_journeys===0))
 assert(r.channels.some((x:any)=>x.channel==='desktop_web'&&x.creator_discount_purchases===1))
 assert(r.outcomes.some((x:any)=>x.outcome==='Stripe checkout expired'&&x.attempts===1))
 assert.deepEqual(r.postPurchase[0],{paid_accounts:2,accounts_evaluated:1,d1_eligible:2,d7_eligible:2,d1_returned:1,d7_returned:1})
 assert.equal(r.steps.find((step:any)=>step.step==='profile.motivation').completed,1)
 const [legacy]=await query('legacy');assert.equal(legacy.report.summary[0].journeys,1)
 console.log('PASS: ordered web funnel, server-only payment proof, duplicate receipts, clock skew, legacy isolation, existing access, missing browser path, mature D1/D7 follow-up')
 const experiment = (unit: string, arm = 'control') => ({
   paywall_experiment_id: 'fixture_length', paywall_experiment_unit: unit.repeat(32), paywall_experiment_arm: arm,
   paywall_experiment_surface: 'mobile', paywall_experiment_kind: 'length', paywall_experiment_ends_at: base + 5 * 86400_000,
   paywall_experiment_minimum: 500,
 })
 const control = experiment('a')
 const treatment = experiment('b', 'treatment')
 const pending = experiment('c', 'treatment')
 await event('test-a', 'paywall_plan_viewed', 10, control)
 await event('test-a', 'paywall_plan_viewed', 11, control)
 await event('test-a', 'onboarding_interaction', 12, { ...control, action: 'checkout_tapped' })
 await event('test-a', 'checkout_started', 13, control, 'server', 'cs_test_a')
 const payment = { mode: 'subscription', status: 'paid', price: 1799, currency: 'usd' }
 await event('test-a', 'checkout_completed', 14, { ...control, ...payment }, 'server', 'cs_test_a', null, 'stripe_verified')
 await event('test-a', 'checkout_completed', 15, { ...control, ...payment }, 'server', 'cs_test_a', null, 'stripe_verified')
 await event('test-b', 'paywall_plan_viewed', 10, { ...treatment, browser_family: 'tiktok' })
 await event('test-b', 'purchase_failed', 12, treatment)
 await event('test-b', 'checkout_completed', 15, { ...treatment, ...payment }, 'web', 'fake')
 await event('test-b', 'checkout_completed', 16, { ...treatment, ...payment, price: 0 }, 'server', 'free', null, 'stripe_verified')
 await event('test-b', 'checkout_completed', 1500, { ...treatment, ...payment }, 'server', 'late', null, 'stripe_verified')
 await event('test-c', 'paywall_plan_viewed', 1500, pending)
 const experimentSql = new PgDialect().sqlToQuery(paywallExperimentCTEs('2026-10-02T02:00:00Z'))
 const rows = await db.unsafe(`with ${experimentSql.sql} select * from paywall_experiments`, experimentSql.params as any[])
 const a = rows.find(row => row.arm === 'control' && row.browser === 'all')!
 const b = rows.find(row => row.arm === 'treatment' && row.browser === 'all')!
 assert.deepEqual([a.exposed, a.mature, a.tapped, a.checkouts, a.paid, a.first_charge_usd_cents].map(Number), [1, 1, 1, 1, 1, 1799])
 assert.deepEqual([b.exposed, b.mature, b.checkout_failures, b.paid].map(Number), [2, 1, 1, 0])
 assert(rows.some(row => row.arm === 'treatment' && row.browser === 'tiktok' && Number(row.mature) === 1))
 console.log('PASS: browser-level paywall experiments, verified positive payments only, duplicate receipts, 24-hour maturity and browser diagnostics')
}finally{await db.end()}
