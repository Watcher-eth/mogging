import { expect, test } from 'bun:test'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery } from './analytics'
import { operationalQuery } from './operations'
import type { SQL } from 'drizzle-orm'

const url = process.env.TEST_ANALYTICS_DATABASE_URL
const now = new Date('2045-01-10T00:00:00Z')
test.skipIf(!url)('customer reporting separates creator, internal and sandbox activity and follows referral/report delivery', async () => {
  if (!url || new URL(url).hostname !== '127.0.0.1' || new URL(url).port !== '55448') throw new Error('Use the isolated analytics test database')
  const db = postgres(url,{max:1,prepare:false})
  const rollback = new Error('rollback fixtures')
  try { await db.begin(async tx => {
    const prefix=crypto.randomUUID()
    const ids=Object.fromEntries(['customer','internal','inviter','friend','paidWaiting'].map(k=>[k,`${prefix}-${k}`]))
    for(const [name,id] of Object.entries(ids)) await tx`insert into users(id,email,analytics_internal) values(${id},${id+'@example.invalid'},${name==='internal'})`
    async function event(name:string,actor:string,props:Record<string,unknown>={},at='2045-01-05',account:string|null=null,session=actor,platform='ios') {
      const id=crypto.randomUUID()
      await tx`insert into analytics_events(id,event_id,event_name,account_id,mobile_install_id,anonymous_id,session_id,platform,environment,properties,occurred_at)
        values(${id},${id},${name},${account},${platform==='ios'?actor:null},${actor},${session},${platform},'production',${tx.json(props as any)},${at}::timestamp)`
    }
    // Creator-only browser is excluded; a creator's real public visit is still customer activity.
    await event('page_viewed','creator-only',{path:'/creator/money'},'2045-01-05',null,'creator-only','web')
    await event('page_viewed','both',{path:'/creator'},'2045-01-05',null,'both','web')
    await event('page_viewed','both',{path:'/'},'2045-01-05',null,'both','web')
    // Anonymous activity before an internal account identifies is excluded too.
    await event('app_first_open','internal-device')
    await event('identity_linked','internal-device',{},'2045-01-05',ids.internal)
    // Same customer can have a sandbox session and a separate genuine production session.
    await event('onboarding_started','customer-device',{},'2045-01-05',ids.customer,'sandbox-session')
    await event('purchase_completed','customer-device',{store_environment:'sandbox'},'2045-01-05',ids.customer,'sandbox-session')
    await event('app_first_open','customer-device',{},'2045-01-06',ids.customer,'live-session')
    await event('paywall_viewed','customer-device',{},'2045-01-06',ids.customer,'live-session')
    await event('app_first_open','testflight-device',{runtime_environment:'sandbox'})
    await tx`insert into referral_signups(referred_user_id,inviter_user_id,created_at) values(${ids.friend},${ids.inviter},'2045-01-04T00:00:00Z')`
    await event('identity_linked','friend-device',{},'2045-01-05',ids.friend)
    await event('paywall_viewed','friend-device',{},'2045-01-05',ids.friend)
    const photo=`${prefix}-photo`,report=`${prefix}-report`,credit=`${prefix}-credit`,sandboxCredit=`${prefix}-sandbox-credit`
    await tx`insert into photos(id,user_id,image_url,image_hash,source) values(${photo},${ids.friend},'https://example.invalid/image',${photo},'user')`
    await tx`insert into analyses(id,photo_id,status,created_at) values(${report},${photo},'complete','2045-01-06')`
    await event('report_viewed','friend-device',{report_id:report},'2045-01-07',ids.friend)
    await tx`insert into payment_entitlements(id,user_id,mobile_install_id,stripe_checkout_session_id,product,source,credit_balance,created_at) values(${credit},${ids.friend},'friend-device',${credit},'evaluation','referral_reward',0,'2045-01-05')`
    await tx`insert into scan_reservations(id,user_id,entitlement_id,request_hash,status,result,created_at) values(${prefix+'-reservation'},${ids.friend},${credit},'hash','complete',${tx.json({analysis:{id:report}})},'2045-01-06')`
    await tx`insert into subscription_events(id,provider,provider_event_id,provider_type,event_name,environment,transaction_id,account_id,occurred_at) values(${prefix+'-sandbox-event'},'revenuecat',${prefix},'INITIAL_PURCHASE','subscription_started','sandbox',${prefix},${ids.customer},'2045-01-05')`
    await tx`insert into payment_entitlements(id,user_id,mobile_install_id,stripe_checkout_session_id,product,source,credit_balance,created_at) values(${sandboxCredit},${ids.customer},'customer-device',${'revenuecat-subscription:app_store:'+prefix+':scans:2045-01-05'},'evaluation','subscription_allowance',0,'2045-01-05')`
    await tx`insert into scan_reservations(id,user_id,entitlement_id,request_hash,status,result,created_at) values(${prefix+'-sandbox-reservation'},${ids.customer},${sandboxCredit},'hash','complete',${tx.json({analysis:{id:'sandbox-report'}})},'2045-01-06')`
    await tx`insert into subscription_events(id,provider,provider_event_id,provider_type,event_name,environment,account_id,amount,currency,occurred_at) values(${prefix+'-paid-event'},'stripe',${prefix+'-paid'},'checkout.session.completed','one_time_purchase','production',${ids.paidWaiting},4.99,'USD','2045-01-05')`
    await tx`insert into subscription_events(id,provider,provider_event_id,provider_type,event_name,environment,account_id,amount,currency,occurred_at) values(${prefix+'-internal-billing'},'stripe',${prefix+'-internal-billing'},'checkout.session.completed','one_time_purchase','production',${ids.internal},99,'USD','2045-01-05')`
    const dialect=new PgDialect()
    async function query(q:SQL){const c=dialect.sqlToQuery(q);const [r]=await tx.unsafe(c.sql,c.params as any);return r.data}
    const dashboard=await query(analyticsQuery({days:'7',platform:'all'},now))
    expect(dashboard.summary.actors).toBe(3) // public browser, real customer, referred friend
    expect(dashboard.summary.first_opens).toBe(1)
    expect(Number(dashboard.revenue[0].gross)).toBe(4.99)
    expect(dashboard.eventMetrics.find((r:any)=>r.event==='purchase_completed')).toBeUndefined()
    expect(dashboard.scanLedger.summary.completed).toBe(1)
    expect(dashboard.scanLedger.summary.reports).toBe(1)
    expect(dashboard.audienceBreakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({audience:'creator / admin',devices:2}),
      expect.objectContaining({audience:'sandbox',devices:2}),
      expect.objectContaining({audience:'internal',devices:1}),
    ]))
    const referrals=await query(operationalQuery({days:'7',section:'Referrals'},now))
    expect(referrals.rows.find((r:any)=>r.milestone==='Credited new accounts').accounts).toBe(1)
    expect(referrals.rows.find((r:any)=>r.milestone==='Signed in on mobile').accounts).toBe(1)
    expect(referrals.rows.find((r:any)=>r.milestone==='Own report viewed').accounts).toBe(1)
    expect(referrals.rows.find((r:any)=>r.milestone==='Confirmed production purchase').accounts).toBe(0)
    const delivery=await query(operationalQuery({days:'7',section:'Scans'},now))
    expect(delivery.rows).toEqual(expect.arrayContaining([
      {status:'Report delivered and viewed',accounts:1},
      {status:'Paid · no report attempt recorded',accounts:1},
    ]))
    expect(delivery.detail).toHaveLength(2)
    throw rollback
  }) } catch(error) {if(error!==rollback)throw error} finally {await db.end()}
})
