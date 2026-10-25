import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
const target=process.env.CREATOR_TEST_DATABASE_URL!
const url=new URL(target)
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/creator_continuity_test') throw new Error('Isolated local test database only')
process.env.DATABASE_URL=target
const { db,schema }=await import('../../lib/db')
const { recordSubmissionUpdate,recordReviewUpdate }=await import('../../lib/creator/submission-updates')
const rollback=new Error('rollback fixtures')
try {
  await db.$client.unsafe(await Bun.file(new URL('../../drizzle/0061_creator_submission_history.sql',import.meta.url)).text())
  await db.transaction(async tx => {
    const [user]=await tx.insert(schema.users).values({ email: `${crypto.randomUUID()}@history.test` }).returning()
    const [creator]=await tx.insert(schema.creatorProfiles).values({ userId: user.id,displayName: 'History fixture' }).returning()
    const [post]=await tx.insert(schema.creatorSubmissions).values({ creatorProfileId: creator.id,title: 'History fixture',platform: 'tiktok',status: 'pending',viewCountThreshold: 20000,usAudiencePercent: 40 }).returning()
    await recordSubmissionUpdate(tx,post.id,'submitted')
    const [approved]=await tx.update(schema.creatorSubmissions).set({ status: 'approved',adminViewCountThreshold: 20000,adminUsAudiencePercent: 38,approvedAmountCents: 1500 }).where(eq(schema.creatorSubmissions.id,post.id)).returning()
    await recordReviewUpdate(tx,post,{ ...approved,status: 'approved' })
    await tx.update(schema.creatorSubmissions).set({ viewCountThreshold: 100000,usAudiencePercent: 60,status: 'in_review' }).where(eq(schema.creatorSubmissions.id,post.id))
    await recordSubmissionUpdate(tx,post.id,'rereview_requested')
    const events=await tx.query.creatorSubmissionUpdates.findMany({ where: eq(schema.creatorSubmissionUpdates.submissionId,post.id) })
    assert.equal(events.length,3)
    assert.equal(events.find(e => e.type==='submitted')!.historySnapshot!.submittedViews,20000)
    assert.equal(events.find(e => e.type==='submitted')!.historySnapshot!.submittedAudiencePercent,40)
    assert.equal(events.find(e => e.type==='approved')!.historySnapshot!.approvedAmountCents,1500)
    assert.equal(events.find(e => e.type==='approved')!.historySnapshot!.verifiedAudiencePercent,38)
    assert.equal(events.find(e => e.type==='rereview_requested')!.historySnapshot!.submittedViews,100000)
    assert.equal(events.find(e => e.type==='rereview_requested')!.historySnapshot!.submittedAudiencePercent,60)
    throw rollback
  }).catch(error => { if(error!==rollback) throw error })
  console.log('PASS event snapshots retain original metrics, verified approval and earnings across rereviews; fixture rolled back')
} finally { await db.$client.end() }
