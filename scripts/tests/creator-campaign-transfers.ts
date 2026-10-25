import assert from 'node:assert/strict'
import { sql, eq } from 'drizzle-orm'
const target = process.env.CREATOR_TEST_DATABASE_URL
if (!target) throw new Error('Set CREATOR_TEST_DATABASE_URL')
const url = new URL(target)
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/creator_continuity_test') throw new Error('Only the isolated local creator test database is allowed')
process.env.DATABASE_URL = target
const { db, schema } = await import('../../lib/db')
const { campaignCommittedCents, campaignPaidCents } = await import('../../lib/creator/campaign-accounting')
const { defaultCreatorSprintTerms } = await import('../../lib/creator/sprint-defaults')
const rollback = new Error('test rollback')
let checks = 0
try {
 await db.transaction(async tx => {
  const [user] = await tx.insert(schema.users).values({ email: `${crypto.randomUUID()}@transfer.test` }).returning()
  const [profile] = await tx.insert(schema.creatorProfiles).values({ userId: user.id, displayName: 'Transfer test' }).returning()
  const values = { description: 'Test only', budgetCents: 300000, startsAt: new Date(), endsAt: new Date(Date.now()+86400000), terms: defaultCreatorSprintTerms() }
  const [old,next] = await tx.insert(schema.creatorSprints).values([{ ...values,name:'Old' },{ ...values,name:'New' }]).returning()
  const [post] = await tx.insert(schema.creatorSubmissions).values({ creatorProfileId:profile.id,sprintId:next.id,title:'Rereview',platform:'tiktok',status:'in_review',approvedAmountCents:1500 }).returning()
  await tx.insert(schema.creatorCampaignTransfers).values({ submissionId:post.id,fromSprintId:old.id,toSprintId:next.id,amountCents:1500,reason:'Test handover' })
  await tx.insert(schema.creatorPayments).values({ creatorProfileId:profile.id,submissionId:post.id,amountCents:1000,status:'paid',paymentOption:'paypal' })
  async function totals(id:string) { const [row]=await tx.execute(sql`select ${campaignCommittedCents(id)} as committed,${campaignPaidCents(id)} as paid`);return row }
  assert.deepEqual(await totals(old.id),{committed:1500,paid:1000});checks++
  assert.deepEqual(await totals(next.id),{committed:0,paid:0});checks++
  await tx.update(schema.creatorSubmissions).set({approvedAmountCents:2500}).where(eq(schema.creatorSubmissions.id,post.id))
  assert.deepEqual(await totals(old.id),{committed:1500,paid:1000});checks++
  assert.deepEqual(await totals(next.id),{committed:1000,paid:0});checks++
  await tx.insert(schema.creatorPayments).values({ creatorProfileId:profile.id,submissionId:post.id,amountCents:1000,status:'paid',paymentOption:'paypal' })
  assert.deepEqual(await totals(old.id),{committed:1500,paid:1500});checks++
  assert.deepEqual(await totals(next.id),{committed:1000,paid:500});checks++
  const [ledger]=await tx.execute(sql`select sum(amount_cents)::int cents from creator_payments where submission_id=${post.id}`)
  assert.equal(ledger.cents,2000);checks++
  assert.equal(Number((await totals(old.id)).paid)+Number((await totals(next.id)).paid),2000);checks++
  throw rollback
 }).catch(error=>{if(error!==rollback)throw error})
 console.log(`PASS ${checks} transfer accounting checks; all fixtures rolled back`)
} finally { await db.$client.end() }
