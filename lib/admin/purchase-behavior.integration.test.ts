import {afterAll,expect,test} from 'bun:test'
import {sql} from 'drizzle-orm'
import type {PurchaseBehavior} from './purchase-behavior'
const address=process.env.RELIABILITY_TEST_DATABASE_URL
if(address){const url=new URL(address);if(url.hostname!=='127.0.0.1'||url.port!=='55448')throw Error('Use isolated local PostgreSQL');process.env.DATABASE_URL=address}
const {purchaseBehaviorCTEs}=await import('./purchase-behavior')
const {reportingCalendar}=await import('./reporting-bucket')
const {db,schema}=await import('@/lib/db')
afterAll(async()=>{if(address)await db.$client.end()})
test.skipIf(!address)('billing purchases include every source, deduplicate orders, and keep repeat/sign-up cohorts mature',async()=>{
 const rollback=Error('rollback fixture')
 try{await db.transaction(async tx=>{
  const prefix=crypto.randomUUID(),at=(day:number,hour=0)=>new Date(Date.UTC(2095,0,day,hour))
  const people=await tx.insert(schema.users).values([['a',1,false],['b',18,false],['internal',1,true]].map(([name,day,internal])=>({email:`${prefix}-${name}@example.invalid`,createdAt:at(Number(day)),analyticsInternal:Boolean(internal)}))).returning()
  async function payment(user:number|null,day:number,productId:string,eventName='one_time_purchase',extra:Record<string,unknown>={}){
   return tx.insert(schema.subscriptionEvents).values({provider:'revenuecat',providerEventId:crypto.randomUUID(),providerType:'fixture',eventName,environment:'production',accountId:user===null?null:people[user].id,transactionId:crypto.randomUUID(),productId,currency:'USD',amount:'5',occurredAt:at(day,2),properties:{store:'APP_STORE'},...extra}).returning()
  }
  const [first]=await payment(0,1,'mogging.evaluation')
  await payment(0,1,'mogging.evaluation','one_time_purchase',{transactionId:first.transactionId})
  await payment(0,3,'evaluation_pack_3','one_time_purchase',{provider:'stripe',properties:{}})
  await payment(0,5,'mogging.pro.monthly','subscription_started')
  await payment(0,12,'mogging.pro.monthly','subscription_renewed')
  await payment(1,19,'mogging.evaluation')
  await payment(null,3,'mogging.evaluation','one_time_purchase',{externalUserId:`anonymous-${prefix}`,properties:{store:'PLAY_STORE'}})
  await payment(null,4,'evaluation_pack_3','one_time_purchase',{provider:'stripe'})
  await payment(0,4,'mogging.evaluation','refund_reversed',{amount:'999'})
  await payment(0,4,'mogging.pro.monthly','trial_started',{amount:'0'})
  await payment(2,4,'mogging.evaluation')
  await payment(1,4,'mogging.evaluation','one_time_purchase',{environment:'sandbox'})
  const [result]=await tx.execute(sql`with internal_accounts as (select id from users where analytics_internal),billing_history as (
    select * from subscription_events where environment='production' and occurred_at<'2095-01-20' and (account_id is null or account_id not in(select id from internal_accounts))
  ),${purchaseBehaviorCTEs('2095-01-01','2095-01-20',30)} select report from purchase_behavior`)
  const r=result.report as PurchaseBehavior
  expect(r.summary[0]).toMatchObject({purchases:7,buyers:3,single_scans:3,bundles:2,subscription_payments:2,renewals:1,repeat_scan_buyers:1,first_buyers:3,timing_linked_first_buyers:2,unidentified_purchases:1})
  expect(r.daily.reduce((sum,row)=>sum+Number(row.purchases),0)).toBe(7)
  expect(r.sources?.reduce((sum,row)=>sum+Number(row.purchases),0)).toBe(7)
  expect(r.sources?.find(row=>row.payment_source==='stripe')).toMatchObject({purchases:2,buyers:1,first_buyers:0})
  expect(r.sources?.find(row=>row.payment_source==='app_store')).toMatchObject({purchases:4,buyers:2,first_buyers:2})
  expect(r.daily.some(row=>Number(row.purchases)===0)).toBe(true)
  expect(r.daily.reduce((sum,row)=>sum+Number(row.stripe),0)).toBe(2)
  expect(r.daily.reduce((sum,row)=>sum+Number(row.google_play),0)).toBe(1)
  expect(r.frequency.find(row=>row.scan_orders==='2')?.buyers).toBe(1)
  expect(r.combinations.find(row=>row.combination==='scans_and_subscription')?.buyers).toBe(1)
  expect(r.signupWindows.find(row=>Number(row.window_days)===3)).toMatchObject({eligible:1,pending:1,buyers:1})
  expect(r.repeatWindows.find(row=>Number(row.window_days)===7)).toMatchObject({eligible:2,pending:1,repeat_scan_buyers:1,later_subscribers:1})
  expect(r.firstPurchase.reduce((sum,row)=>sum+Number(row.buyers),0)).toBe(2)
  throw rollback
 })}catch(error){if(error!==rollback)throw error}
},20_000)

// Pacific day boundaries must survive the autumn clock change.
test.skipIf(!address)('calendar keeps the 25-hour Pacific day and excludes an exact end boundary',async()=>{
 const rows=await db.execute(sql`${reportingCalendar('2026-10-31T07:00:00Z','2026-11-03T08:00:00Z',7)}`)
 expect(rows.map(row=>row.day)).toEqual(['2026-10-31T07:00:00Z','2026-11-01T07:00:00Z','2026-11-02T08:00:00Z'])
})
