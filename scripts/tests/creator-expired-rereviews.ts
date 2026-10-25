import assert from 'node:assert/strict'
import { eq, sql } from 'drizzle-orm'

const target = process.env.CREATOR_TEST_DATABASE_URL
if (!target) throw new Error('Set CREATOR_TEST_DATABASE_URL')
const url = new URL(target)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/creator_continuity_test') throw new Error('Only the isolated local creator test database is allowed')
process.env.DATABASE_URL = target
const { db, schema } = await import('../../lib/db')
const { expiredRereviewAssignment } = await import('../../lib/creator/rereview-campaign')
const { campaignCommittedCents, campaignPaidCents } = await import('../../lib/creator/campaign-accounting')
const { defaultCreatorSprintTerms } = await import('../../lib/creator/sprint-defaults')
const { LAUNCH_CAMPAIGNS, launchCampaignTerms } = await import('../../lib/creator/campaign-launch')
const { sprintPayoutCents } = await import('../../lib/creator/sprints')
const rollback = new Error('test rollback')
let checks = 0
try {
  await db.transaction(async tx => {
    const now = new Date()
    const [user] = await tx.insert(schema.users).values({ email: `${crypto.randomUUID()}@rereview.test` }).returning()
    const [creator] = await tx.insert(schema.creatorProfiles).values({ userId: user.id, displayName: 'Rereview test' }).returning()
    const legacyTerms = defaultCreatorSprintTerms()
    const generalTerms = launchCampaignTerms(LAUNCH_CAMPAIGNS.find(c => c.key === 'general-looksmaxxing')!)
    const base = { description: 'Local rollback fixture', budgetCents: 250000, startsAt: new Date(now.getTime() - 86400000), endsAt: new Date(now.getTime() + 86400000) }
    const [old, general, face, activeOld] = await tx.insert(schema.creatorSprints).values([
      { ...base, name: 'Expired', status: 'ended', endsAt: new Date(now.getTime() - 1000), terms: legacyTerms },
      { ...base, name: 'General', status: 'published', terms: generalTerms },
      { ...base, name: 'Face', status: 'published', terms: launchCampaignTerms(LAUNCH_CAMPAIGNS.find(c => c.key === 'feature-comparison')!) },
      { ...base, name: 'Still active legacy', status: 'published', terms: legacyTerms },
    ]).returning()
    const [post] = await tx.insert(schema.creatorSubmissions).values({ creatorProfileId: creator.id, sprintId: old.id, sprintTerms: legacyTerms, formatId: legacyTerms.formats[0].id, title: 'Paid rereview', platform: 'tiktok', status: 'in_review', approvedAmountCents: 3500, reviewRequestedAt: now, viewCountThreshold: 110300, usAudiencePercent: 45.4 }).returning()
    const [payment] = await tx.insert(schema.creatorPayments).values({ creatorProfileId: creator.id, submissionId: post.id, amountCents: 3500, status: 'paid', paymentOption: 'paypal', providerReference: 'settled-proof' }).returning()
    async function totals(id: string) { return (await tx.execute(sql`select ${campaignCommittedCents(id)} as committed, ${campaignPaidCents(id)} as paid`))[0] }
    const oldBefore = await totals(old.id)
    const assignment = await expiredRereviewAssignment(tx, post, now)
    assert.equal(assignment?.sprintId, general.id); checks++
    await tx.update(schema.creatorSubmissions).set(assignment!).where(eq(schema.creatorSubmissions.id, post.id))
    assert.equal(sprintPayoutCents(assignment!.sprintTerms, 110300, 45.4), 3000); checks++
    assert.deepEqual(await totals(old.id), oldBefore); checks++
    assert.deepEqual(await totals(general.id), { committed: 0, paid: 0 }); checks++
    const saved = await tx.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, post.id) })
    assert.equal(saved!.approvedAmountCents, 3500); checks++
    assert.deepEqual(await tx.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.id, payment.id) }), payment); checks++
    assert.equal(await expiredRereviewAssignment(tx, saved!, now), undefined); checks++
    assert.equal(await expiredRereviewAssignment(tx, { ...post, sprintId: face.id, sprintTerms: face.terms }, now), undefined); checks++
    assert.equal(await expiredRereviewAssignment(tx, { ...post, sprintId: activeOld.id }, now), undefined); checks++
    const transfers = await tx.query.creatorCampaignTransfers.findMany({ where: eq(schema.creatorCampaignTransfers.submissionId, post.id) })
    assert.equal(transfers.length, 1); checks++
    assert.equal(transfers[0].amountCents, 3500); checks++
    const [facePost] = await tx.insert(schema.creatorSubmissions).values({ creatorProfileId: creator.id, sprintId: face.id, sprintTerms: face.terms, title: 'Today rereview', platform: 'tiktok', status: 'approved', approvedAmountCents: 4000 }).returning()
    await tx.insert(schema.creatorCampaignTransfers).values({ submissionId: facePost.id, fromSprintId: old.id, toSprintId: face.id, amountCents: 0, reason: 'Prior zero-value handover' })
    await tx.insert(schema.creatorPayments).values({ creatorProfileId: creator.id, submissionId: facePost.id, amountCents: 1250, status: 'paid', paymentOption: 'paypal' })
    assert.deepEqual(await totals(face.id), { committed: 4000, paid: 1250 }); checks++
    await tx.update(schema.creatorCampaignTransfers).set({ fromSprintId: face.id, toSprintId: general.id, amountCents: 1250 }).where(eq(schema.creatorCampaignTransfers.submissionId, facePost.id))
    await tx.update(schema.creatorSubmissions).set({ sprintId: general.id, sprintTerms: general.terms, approvedAmountCents: 3000 }).where(eq(schema.creatorSubmissions.id, facePost.id))
    assert.deepEqual(await totals(old.id), oldBefore); checks++
    assert.deepEqual(await totals(face.id), { committed: 1250, paid: 1250 }); checks++
    assert.deepEqual(await totals(general.id), { committed: 1750, paid: 0 }); checks++
    throw rollback
  }).catch(error => { if (error !== rollback) throw error })
  console.log(`PASS ${checks} expired rereview checks; fixtures rolled back`)
} finally { await db.$client.end() }
