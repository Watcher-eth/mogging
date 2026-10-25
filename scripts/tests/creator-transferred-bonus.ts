import assert from 'node:assert/strict'
import {eq,inArray} from 'drizzle-orm'
const target=process.env.CREATOR_TEST_DATABASE_URL!
const url=new URL(target)
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/creator_continuity_test')throw Error('Isolated local test database only')
process.env.DATABASE_URL=target
const {db,schema}=await import('../../lib/db')
const {syncCreatorCampaignBonuses}=await import('../../lib/creator/bonus-service')
const {LAUNCH_CAMPAIGNS,launchCampaignTerms}=await import('../../lib/creator/campaign-launch')
const {submissionBonusPayments}=await import('../../lib/creator/bonus-payments')
const ids:string[]=[]
let userId='',profileId=''
try{
 const [user]=await db.insert(schema.users).values({email:`${crypto.randomUUID()}@transferred-bonus.test`}).returning();userId=user.id
 const [profile]=await db.insert(schema.creatorProfiles).values({userId,displayName:'Local transfer bonus',authStatus:'verified'}).returning();profileId=profile.id
 for(const c of LAUNCH_CAMPAIGNS.slice(1)){
  const [s]=await db.insert(schema.creatorSprints).values({name:c.name,description:'Local fixture',status:'published',budgetCents:250000,terms:launchCampaignTerms(c),startsAt:new Date(Date.now()-86400000),endsAt:new Date(Date.now()+86400000)}).returning();ids.push(s.id)
 }
 const [post]=await db.insert(schema.creatorSubmissions).values({creatorProfileId:profileId,sprintId:ids[0],sprintTerms:launchCampaignTerms(LAUNCH_CAMPAIGNS[1]),platform:'tiktok',title:'Local post',status:'approved',approvedAmountCents:4000,adminViewCountThreshold:107000,adminUsAudiencePercent:62.6}).returning()
 assert.equal(await syncCreatorCampaignBonuses(profileId),1)
 const before=await db.query.creatorPayments.findMany({where:eq(schema.creatorPayments.creatorProfileId,profileId)})
 const [moved]=await db.update(schema.creatorSubmissions).set({sprintId:ids[1],sprintTerms:launchCampaignTerms(LAUNCH_CAMPAIGNS[2]),approvedAmountCents:3000}).where(eq(schema.creatorSubmissions.id,post.id)).returning()
 assert.equal(await syncCreatorCampaignBonuses(profileId),0)
 const after=await db.query.creatorPayments.findMany({where:eq(schema.creatorPayments.creatorProfileId,profileId)})
 assert.deepEqual(after,before)
 assert.equal(submissionBonusPayments(moved,after).length,1)
 console.log('PASS transfer reconciliation creates no duplicate; original bonus, budget allocation and creator visibility preserved')
}finally{
 if(profileId)await db.delete(schema.creatorPayments).where(eq(schema.creatorPayments.creatorProfileId,profileId))
 if(userId)await db.delete(schema.users).where(eq(schema.users.id,userId))
 if(ids.length)await db.delete(schema.creatorSprints).where(inArray(schema.creatorSprints.id,ids))
 await db.$client.end()
}
