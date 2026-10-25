import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq, inArray } from 'drizzle-orm'
import { defaultCreatorSprintTerms } from './sprint-defaults'

const testUrl = process.env.CREATOR_TEST_DATABASE_URL
let database: typeof import('@/lib/db')
let payouts: typeof import('./bundled-payouts')
let admin: typeof import('@/lib/admin/creator-service')
const users: string[] = [], campaigns: string[] = []

describe.skipIf(!testUrl)('saved payout method readiness', () => {
 beforeAll(async () => {
  const url = new URL(testUrl!)
  if (url.hostname !== '127.0.0.1' || url.pathname !== '/creator_continuity_test') throw new Error('Only the isolated local creator continuity database is allowed')
  process.env.DATABASE_URL = testUrl
  database = await import('@/lib/db')
  payouts = await import('./bundled-payouts')
  admin = await import('@/lib/admin/creator-service')
 })
 afterAll(async () => {
  if (!database) return
  const { db, schema } = database
  if (users.length) await db.delete(schema.users).where(inArray(schema.users.id, users))
  if (campaigns.length) await db.delete(schema.creatorSprints).where(inArray(schema.creatorSprints.id, campaigns))
  await db.$client.end()
 })
 async function fixture(bundledPayouts: boolean) {
  const { db, schema } = database
  const [user] = await db.insert(schema.users).values({ email: `${crypto.randomUUID()}@payout-readiness.test` }).returning(); users.push(user.id)
  const [profile] = await db.insert(schema.creatorProfiles).values({ userId:user.id, displayName:'Payout readiness test', authStatus:'pending', paypalEmail:'creator@payout-readiness.test', bundledPayouts }).returning()
  const [campaign] = await db.insert(schema.creatorSprints).values({ name:'Local payout readiness', description:'Test only', terms:defaultCreatorSprintTerms(), budgetCents:10000, startsAt:new Date(), endsAt:new Date(Date.now()+86400000) }).returning(); campaigns.push(campaign.id)
  const [post] = await db.insert(schema.creatorSubmissions).values({ creatorProfileId:profile.id, sprintId:campaign.id, sprintTerms:campaign.terms, title:'Local sample', platform:'instagram', status:'approved', approvedAmountCents:1500, adminViewCountThreshold:20000, adminUsAudiencePercent:30 }).returning()
  return { user, profile, post }
 }
 test('a pending profile with saved details can request its approved bundle without an approval step', async () => {
  const f = await fixture(true)
  const request = await payouts.requestBundledPayout(f.user.id,1500)
  expect(request).toMatchObject({amountCents:1500,status:'pending',destination:f.profile.paypalEmail})
  expect((await payouts.requestBundledPayout(f.user.id,1500)).id).toBe(request.id)
 })
 test('a pending profile can have its approved individual payment scheduled once', async () => {
  const f = await fixture(false)
  const input = { submissionId:f.post.id,adminViewCountThreshold:20000,adminUsAudiencePercent:30,status:'pending' as const }
  expect(await admin.createCreatorPayment(input)).toMatchObject({amountCents:1500,status:'pending'})
  await expect(admin.createCreatorPayment(input)).rejects.toThrow('already scheduled')
 })
 test('suspension and missing payout destinations still block both payout paths', async () => {
  const { db, schema } = database
  for (const bundled of [true,false]) {
   const f = await fixture(bundled)
   const request = () => bundled ? payouts.requestBundledPayout(f.user.id,1500) : admin.createCreatorPayment({submissionId:f.post.id,adminViewCountThreshold:20000,adminUsAudiencePercent:30,status:'pending'})
   await db.update(schema.creatorProfiles).set({authStatus:'suspended'}).where(eq(schema.creatorProfiles.id,f.profile.id))
   await expect(request()).rejects.toMatchObject({status:409})
   await db.update(schema.creatorProfiles).set({authStatus:'pending',paypalEmail:null}).where(eq(schema.creatorProfiles.id,f.profile.id))
   await expect(request()).rejects.toMatchObject({status:409})
   expect(await db.query.creatorPayments.findMany({where:eq(schema.creatorPayments.creatorProfileId,f.profile.id)})).toHaveLength(0)
  }
 })
})
