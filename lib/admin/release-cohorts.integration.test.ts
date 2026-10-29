import {afterAll,expect,test} from 'bun:test'
import {sql} from 'drizzle-orm'
import {releaseCohortsQuery} from './release-cohorts'
const address=process.env.RELIABILITY_TEST_DATABASE_URL
if(address){const url=new URL(address);if(url.hostname!=='127.0.0.1'||url.port!=='55448')throw Error('Only isolated reliability PostgreSQL is allowed');process.env.DATABASE_URL=address}
const suite=address?test:test.skip
const {db,schema}=await import('@/lib/db')
afterAll(async()=>{if(address)await db.$client.end()})
const now=new Date('2035-01-20T00:00:00Z'),day=(n:number)=>new Date(Date.UTC(2035,0,n))

suite('release cohorts use one verified purchase owner, real report views, mature outcomes and distinct repeat reports',async()=>{
 const prefix=crypto.randomUUID(),release=`new-${prefix}`,old=`old-${prefix}`
 const users=await db.insert(schema.users).values(['active','reused','fresh','internal','sandbox'].map(name=>({email:`${name}-${prefix}@example.invalid`,analyticsInternal:name==='internal'}))).returning()
 async function event(index:number,name:string,at:Date,version=release,properties:Record<string,unknown>={}){
  await db.insert(schema.analyticsEvents).values({eventId:crypto.randomUUID(),eventName:name,accountId:users[index].id,mobileInstallId:`mob_${users[index].id}`,platform:'ios',appVersion:version,environment:'production',occurredAt:at,properties})
 }
 for(let i=0;i<users.length;i++){
  const fresh=i===2
  await event(i,'paywall_viewed',day(fresh?19:10))
  await db.insert(schema.subscriptionEvents).values({provider:'revenuecat',providerEventId:crypto.randomUUID(),providerType:'INITIAL_PURCHASE',eventName:'subscription_started',environment:i===4?'sandbox':'production',accountId:users[i].id,amount:'9.99',currency:'USD',occurredAt:day(fresh?19:11)})
 }
 await event(0,'paywall_viewed',day(9),old)
 await db.insert(schema.subscriptionEvents).values({provider:'revenuecat',providerEventId:crypto.randomUUID(),providerType:'CANCELLATION',eventName:'cancellation_scheduled',environment:'production',accountId:users[0].id,amount:'0',occurredAt:new Date(+day(11)+3600000)})
 await event(0,'protocol_task_completed',day(12))
 for(const i of [0,1]){
  const report=crypto.randomUUID(),second=crypto.randomUUID()
  const [photo]=await db.insert(schema.photos).values({userId:users[i].id,source:'user',photoType:'face',imageUrl:'https://example.invalid/local-fixture',imageHash:crypto.randomUUID()}).returning()
  await db.insert(schema.analyses).values({id:report,photoId:photo.id,status:'complete',model:'fixture',promptVersion:'fixture'})
  await event(i,'report_viewed',new Date(+day(11)+7200000),release,{report_id:i===0?report:'unrelated-sample'})
  const [credit]=await db.insert(schema.paymentEntitlements).values({userId:users[i].id,mobileInstallId:`mob_${users[i].id}`,stripeCheckoutSessionId:crypto.randomUUID(),product:'evaluation',source:'test'}).returning()
  for(const [at,id] of [[11,report],[13,i===0?second:report]] as const) await db.insert(schema.scanReservations).values({id:crypto.randomUUID(),userId:users[i].id,entitlementId:credit.id,requestHash:crypto.randomUUID(),status:'complete',createdAt:day(at),result:{analysis:{id}}})
 }
 const rows=await db.execute(releaseCohortsQuery(14,now)),row=rows.find(row=>row.release===release)!
 expect(row.paywall_devices).toBe(4)
 expect(row.verified_buyers).toBe(3)
 expect(row.eligible24).toBe(3)
 expect(row.eligible7).toBe(2)
 expect(row.report_viewed24).toBe(1)
 expect(row.canceled24).toBe(1)
 expect(row.task7).toBe(1)
 expect(row.repeat_scan7).toBe(1)
 expect(rows.find(row=>row.release===old)?.verified_buyers).toBe(0)
 const partial=await db.execute(releaseCohortsQuery(7,new Date('2035-01-19T12:00:00Z')))
 const latest=partial.find(row=>row.release===release)!
 expect(latest.eligible24).toBe(0)
 expect(latest.report_viewed24).toBeNull()
 expect(latest.eligible7).toBe(0)
 expect(latest.refunded7).toBeNull()
})
