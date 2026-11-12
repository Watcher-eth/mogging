import {afterAll,expect,test} from 'bun:test'
import {sql} from 'drizzle-orm'
import type {AnalyticsDashboard} from './analytics'
const address=process.env.PURCHASE_FLOW_TEST_DATABASE_URL
if(address){const url=new URL(address);if(url.hostname!=='127.0.0.1'||url.port!=='55448')throw Error('Use disposable local PostgreSQL');process.env.DATABASE_URL=address}
const {db,schema}=await import('@/lib/db')
const {analyticsQuery}=await import('./analytics')
const {purchaseAttemptsQuery}=await import('./purchase-attempt-query')
afterAll(async()=>{if(address)await db.$client.end()})
test.skipIf(!address)('mobile errors, missing callbacks, and Stripe payment signals keep independent populations',async()=>{
 const rollback=Error('rollback')
 try{await db.transaction(async tx=>{
  const prefix=crypto.randomUUID(),at=new Date('2070-01-15T12:00:00Z')
  for(const [attempt,result,extra] of [
   ['restricted','purchase_failed',{error_code:'3',reason_code:'purchase_not_allowed'}],
   ['store','purchase_failed',{error_code:'2',reason_code:'store_problem'}],
   ['missing','purchase_app_state',{app_state:'background'}],
   ['paid','purchase_completed',{transaction_id:prefix}],
  ] as const){
   for(const [index,event] of ['purchase_started','checkout_started',result,...(attempt==='paid'?['purchase_activated']:[])].entries()){
    await tx.insert(schema.analyticsEvents).values({eventId:crypto.randomUUID(),eventName:event,mobileInstallId:`${prefix}-${attempt}`,platform:'ios',environment:'production',appVersion:'fixture',occurredAt:new Date(+at+index*1000),properties:{attempt_id:attempt,productId:'monthly',purchase_kind:'subscription',purchase_tracking_version:'2',runtime_environment:'production',purchase_stage:'store_purchase',...(index>=2?extra:{})}})
   }
  }
  await tx.insert(schema.subscriptionEvents).values([
   {provider:'revenuecat',providerEventId:crypto.randomUUID(),providerType:'INITIAL_PURCHASE',environment:'production',eventName:'subscription_started',transactionId:prefix,productId:'monthly',amount:'5',currency:'USD',occurredAt:new Date(+at+2000)},
   {provider:'stripe',providerEventId:crypto.randomUUID(),providerType:'payment_intent.payment_failed',environment:'production',eventName:'payment_failed',transactionId:`${prefix}-stripe`,amount:null,currency:'USD',occurredAt:at,properties:{decline_code:'insufficient_funds'}},
  ])
  const [result]=await tx.execute(analyticsQuery({days:'30',platform:'ios',section:'Purchases'},new Date('2070-01-31T00:00:00Z')))
  const flow=(result.data as AnalyticsDashboard).purchaseFlow!
  expect(flow.summary[0]).toMatchObject({attempts:4,errors:2,restricted:1,technical_errors:1,unresolved:1,purchased:1,activated:1})
  expect(flow.interruptions).toHaveLength(1)
  expect(flow.interruptions![0]).toMatchObject({release:'fixture',attempts:1,evidence:'app_left_active_state'})
  expect(flow.builds![0]).toMatchObject({attempts:4,errors:2,unresolved:1})
  expect(flow.stripeActivity).toHaveLength(1)
  expect(flow.stripeActivity![0]).toMatchObject({event_name:'payment_failed',reason:'insufficient_funds',events:1})
  expect(flow.outcomes.reduce((sum,row)=>sum+Number(row.attempts),0)).toBe(4)
  const detailed=await tx.execute(purchaseAttemptsQuery({days:'30',platform:'ios',section:'Purchases'},new Date('2070-01-31T00:00:00Z')))
  expect(detailed).toHaveLength(4)
  expect(detailed.every(row=>typeof row.started==='string' && row.started.endsWith('Z'))).toBe(true)
  const accounts=await tx.insert(schema.users).values(['recover','ambiguous','wrong','unrelated'].map(name=>({email:`${prefix}-${name}@example.invalid`,createdAt:new Date('2070-01-01')}))).returning({id:schema.users.id})
  async function request(account:number,attempt:string,product='monthly'){
   for(const [index,eventName] of ['purchase_started','checkout_started'].entries())await tx.insert(schema.analyticsEvents).values({eventId:crypto.randomUUID(),eventName,accountId:accounts[account].id,mobileInstallId:`${prefix}-${attempt}`,platform:'ios',environment:'production',appVersion:'fixture',occurredAt:new Date(+at+index*1000),properties:{attempt_id:attempt,productId:product,purchase_stage:'store_purchase',runtime_environment:'production'}})
  }
  await request(0,'recover');await request(1,'retry-a');await request(1,'retry-b');await request(2,'wrong-account');await request(0,'old-access','yearly')
  for(const [index,account,product,offset] of [[0,0,'monthly',30000],[1,1,'monthly',30000],[2,3,'monthly',30000],[3,0,'yearly',-86400000]] as const){
   await tx.insert(schema.subscriptionEvents).values({provider:'revenuecat',providerEventId:crypto.randomUUID(),providerType:'INITIAL_PURCHASE',environment:'production',eventName:'subscription_started',accountId:accounts[account].id,transactionId:`${prefix}-${index}`,productId:product,amount:'5',currency:'USD',properties:{store:'APP_STORE'},occurredAt:new Date(+at+offset)})
  }
  const [reconciled]=await tx.execute(analyticsQuery({days:'30',platform:'ios',section:'Purchases'},new Date('2070-01-31T00:00:00Z')))
  const recovered=(reconciled.data as AnalyticsDashboard).purchaseFlow!
  expect(recovered.summary[0]).toMatchObject({attempts:9,purchased:2,verified:2,activated:1,unresolved:5,access_unconfirmed:1})
  expect(recovered.outcomes.find(row=>row.outcome==='purchased_access_pending')?.attempts).toBe(1)
  for(const [index,eventName] of ['purchase_completed','purchase_activated'].entries())await tx.insert(schema.analyticsEvents).values({eventId:crypto.randomUUID(),eventName,accountId:accounts[0].id,mobileInstallId:`${prefix}-old-access`,platform:'ios',environment:'production',occurredAt:new Date(+at+4000+index*1000),properties:{attempt_id:'old-access',productId:'yearly',transaction_id:`${prefix}-3`,runtime_environment:'production'}})
  const [restored]=await tx.execute(analyticsQuery({days:'30',platform:'ios',section:'Purchases'},new Date('2070-01-31T00:00:00Z')))
  const restoredFlow=(restored.data as AnalyticsDashboard).purchaseFlow!
  expect(restoredFlow.summary[0]).toMatchObject({attempts:9,purchased:3,verified:3,activated:2,restored_access:1,unresolved:4})
  expect(restoredFlow.outcomes.find(row=>row.outcome==='existing_access')?.attempts).toBe(1)
  const androidProduct='mobile_subscription_weekly'
  for(const [index,attempt] of ['paid-and-active','paid-no-return','wrong-account'].entries()){
   for(const [step,eventName] of ['purchase_started','checkout_started'].entries()){
    await tx.insert(schema.analyticsEvents).values({eventId:crypto.randomUUID(),eventName,accountId:accounts[index].id,mobileInstallId:`${prefix}-android-${index}`,platform:'android',environment:'production',appVersion:'1.50(85)',occurredAt:new Date(+at+step*1000),properties:{attempt_id:attempt,product:androidProduct,provider:'stripe'}})
   }
   for(const [step,eventName] of ['checkout_completed',...(index===1?[]:['purchase_activated'])].entries()){
    await tx.insert(schema.analyticsEvents).values({eventId:crypto.randomUUID(),eventName,accountId:accounts[index===2?3:index].id,platform:'server',environment:'production',source:eventName==='checkout_completed'?'stripe_verified':'stripe_access_verified',occurredAt:new Date(+at+2000+step*1000),properties:{attempt_id:attempt,product:androidProduct,provider:'stripe',surface:'android_direct_paywall'}})
   }
  }
  const [android]=await tx.execute(analyticsQuery({days:'30',platform:'android',section:'Purchases'},new Date('2070-01-31T00:00:00Z')))
  expect((android.data as AnalyticsDashboard).purchaseFlow!.summary[0]).toMatchObject({attempts:3,verified:2,purchased:2,activated:1,access_unconfirmed:1,unresolved:1})
  throw rollback
 })}catch(error){if(error!==rollback)throw error}
})
