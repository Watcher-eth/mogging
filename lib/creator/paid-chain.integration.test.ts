import {afterAll,expect,test} from 'bun:test'
import {createHash} from 'node:crypto'
import {eq,sql} from 'drizzle-orm'
const address=process.env.RELIABILITY_TEST_DATABASE_URL
if(address){const url=new URL(address);if(url.hostname!=='127.0.0.1'||url.port!=='55448')throw Error('Only the isolated reliability database is allowed');process.env.DATABASE_URL=address}
const suite=address?test:test.skip
const {db,schema}=await import('@/lib/db')
const attribution=await import('./attribution')
const {createReferralHandoff,redeemReferralHandoff}=await import('./continuity')
const {recordRevenueCatLifecycle}=await import('@/lib/payments/billing-ledger')
const {allocateCreatorBillingEvent}=await import('./billing-attribution')
afterAll(async()=>{if(address)await db.$client.end()})

suite('shared creator link preserves video identity through recovery, install, account, paid lifecycle, refund and deduplication',async()=>{
 const key=crypto.randomUUID().replaceAll('-','')
 const [owner,buyer]=await db.insert(schema.users).values([{email:`owner-${key}@example.invalid`},{email:`buyer-${key}@example.invalid`}]).returning()
 const [profile]=await db.insert(schema.creatorProfiles).values({userId:owner.id,displayName:'Integration fixture',authStatus:'verified'}).returning()
 const [tiktok,instagram]=await db.insert(schema.creatorSocialAccounts).values(['tiktok','instagram'].map(platform=>({creatorProfileId:profile.id,platform:platform as 'tiktok'|'instagram',handle:`fixture${key.slice(0,12)}`,status:'approved' as const}))).returning()
 const link=await attribution.ensureCreatorTrackingLink(tiktok.id)
 expect(link).not.toBeNull()
 expect((await attribution.ensureCreatorTrackingLink(instagram.id))?.id).toBe(link!.id)
 const postUrl=`https://www.instagram.com/reel/fixture${key}/`
 const [post]=await db.insert(schema.creatorSubmissions).values({creatorProfileId:profile.id,socialAccountId:instagram.id,title:'Video fixture',platform:'Instagram',status:'approved',postUrl,postKey:`instagram:fixture${key}`}).returning()
 const click=await attribution.createCreatorAttributionClick({postUrl,anonymousActorId:`browser_${key}`,userAgent:'Mogging iOS integration fixture'})
 expect(click?.click.submissionId).toBe(post.id)
 expect(click?.link.id).toBe(link!.id)
 const verifier='a'.repeat(64),install=`mob_${key}`
 const ticket=await createReferralHandoff(click!.click.id,createHash('sha256').update(verifier).digest('hex'))
 const recovered=await redeemReferralHandoff({ticket,verifier,mobileInstallId:install})
 await expect(redeemReferralHandoff({ticket,verifier,mobileInstallId:`mob_other${key}`})).rejects.toThrow('expired')
 expect((await redeemReferralHandoff({ticket,verifier,mobileInstallId:install})).clickId).toBe(click!.click.id)
 await attribution.recordCreatorInstall({token:recovered.token,mobileInstallId:install})
 await attribution.associateMobileCreatorAttribution({token:recovered.token,mobileInstallId:install,userId:buyer.id})
 const event={id:`paid_${key}`,type:'INITIAL_PURCHASE',app_user_id:buyer.id,original_transaction_id:`sub_${key}`,transaction_id:`tx_${key}`,environment:'PRODUCTION',price:9.99,currency:'USD',purchased_at_ms:Date.now()+1000,event_timestamp_ms:Date.now()+1000}
 await recordRevenueCatLifecycle(event)
 const fact=(await db.query.subscriptionEvents.findFirst({where:eq(schema.subscriptionEvents.providerEventId,event.id)}))!
 expect(await allocateCreatorBillingEvent(fact)).toBe('allocated')
 await recordRevenueCatLifecycle(event);await allocateCreatorBillingEvent(fact)
 const paid=await db.query.creatorAttributionEvents.findMany({where:eq(schema.creatorAttributionEvents.dedupeKey,`creator-payment:revenuecat:${event.id}`)})
 expect(paid).toHaveLength(1)
 expect(paid[0]).toMatchObject({userId:buyer.id,trackingLinkId:link!.id,clickId:click!.click.id,amountCents:999})
 expect((await db.query.creatorAttributionClicks.findFirst({where:eq(schema.creatorAttributionClicks.id,paid[0].clickId!)}))?.submissionId).toBe(post.id)
 const refund={...event,id:`refund_${key}`,type:'CANCELLATION',cancel_reason:'CUSTOMER_SUPPORT',event_timestamp_ms:Date.now()+2000}
 await recordRevenueCatLifecycle(refund)
 const refundFact=(await db.query.subscriptionEvents.findFirst({where:eq(schema.subscriptionEvents.providerEventId,refund.id)}))!
 expect(await allocateCreatorBillingEvent(refundFact)).toBe('allocated')
 const reversed=(await db.query.creatorAttributionEvents.findFirst({where:eq(schema.creatorAttributionEvents.dedupeKey,`creator-refund:revenuecat:${refund.id}`)}))!
 expect(reversed).toMatchObject({trackingLinkId:link!.id,clickId:click!.click.id,amountCents:-999})
 const result=await db.execute(sql`select sum(amount_cents)::int as net from creator_attribution_events where user_id=${buyer.id} and event_type in ('payment','refund')`)
 expect(result[0].net).toBe(0)
})
