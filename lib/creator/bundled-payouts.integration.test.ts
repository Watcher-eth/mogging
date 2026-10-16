import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import sharp from 'sharp'
import { creatorBundlePlan } from './money'
import { defaultCreatorSprintTerms } from './sprint-defaults'

const testUrl = process.env.TEST_BUNDLED_PAYOUT_DATABASE_URL
let database: typeof import('@/lib/db')
let payouts: typeof import('./bundled-payouts')
let admin: typeof import('@/lib/admin/creator-service')

describe.skipIf(!testUrl)('bundled payouts database integration', () => {
  beforeAll(async () => {
    const url = new URL(testUrl!)
    if (url.hostname !== '127.0.0.1' || url.port !== '55448') throw new Error('Use the isolated localhost payout-test database on port 55448')
    process.env.DATABASE_URL = testUrl
    database = await import('@/lib/db')
    payouts = await import('./bundled-payouts')
    admin = await import('@/lib/admin/creator-service')
  })
  afterAll(async () => { if (database) await database.db.$client.end() })

  async function fixture() {
    const { db, schema } = database
    const userId = crypto.randomUUID()
    await db.insert(schema.users).values({ id: userId, email: `${userId}@bundle-test.local` })
    const [profile] = await db.insert(schema.creatorProfiles).values({ userId, displayName: 'Bundle test', authStatus: 'verified', bundledPayouts: true, paypalEmail: 'original@bundle-test.local' }).returning()
    const [sprint] = await db.insert(schema.creatorSprints).values({ name: 'Bundle test', description: 'Test', status: 'published', budgetCents: 100_000, startsAt: new Date(0), endsAt: new Date('2030-01-01'), terms: defaultCreatorSprintTerms() }).returning()
    const [first, second] = await db.insert(schema.creatorSubmissions).values([3500, 1500].map((approvedAmountCents, i) => ({ creatorProfileId: profile.id, sprintId: sprint.id, sprintTerms: sprint.terms, title: `Video ${i}`, platform: 'tiktok', status: 'approved' as const, approvedAmountCents, adminViewCountThreshold: 50_000, adminUsAudiencePercent: 40 }))).returning()
    const [prior] = await db.insert(schema.creatorPayments).values({ creatorProfileId: profile.id, submissionId: first.id, amountCents: 1500, status: 'paid', paymentOption: 'paypal', paidAt: new Date() }).returning()
    return { userId, profile, sprint, first, second, prior }
  }
  async function records(profileId: string) {
    return database.db.query.creatorPayments.findMany({ where: eq(database.schema.creatorPayments.creatorProfileId, profileId) })
  }

  test('3500 total minus 1500 already paid, plus 1500 new earnings, reserves exactly 3500', async () => {
    const f = await fixture()
    const request = await payouts.requestBundledPayout(f.userId, 3500)
    expect(request).toMatchObject({ amountCents: 3500, status: 'pending', destination: 'original@bundle-test.local' })
    const payments = await records(f.profile.id)
    expect(payments.filter(p => p.payoutRequestId === request.id).map(p => p.amountCents).sort()).toEqual([1500, 2000])
    expect(payments.find(p => p.id === f.prior.id)?.status).toBe('paid')
    expect(creatorBundlePlan([f.first, f.second], payments).amountCents).toBe(0)
  })

  test('simultaneous Pay me now clicks create one request and one reservation per increase', async () => {
    const f = await fixture()
    const requests = await Promise.all([payouts.requestBundledPayout(f.userId, 3500), payouts.requestBundledPayout(f.userId, 3500)])
    expect(requests[0].id).toBe(requests[1].id)
    expect((await records(f.profile.id)).filter(p => p.status === 'pending')).toHaveLength(2)
  })

  test('reuses scheduled money, excludes processing, and ignores failed and cancelled attempts', async () => {
    const f = await fixture()
    const { db, schema } = database
    const [pending] = await db.insert(schema.creatorPayments).values([
      { creatorProfileId: f.profile.id, submissionId: f.first.id, amountCents: 700, status: 'pending' as const, paymentOption: 'paypal' as const },
      { creatorProfileId: f.profile.id, submissionId: f.first.id, amountCents: 500, status: 'processing' as const, paymentOption: 'paypal' as const },
      { creatorProfileId: f.profile.id, submissionId: f.first.id, amountCents: 9999, status: 'failed' as const, paymentOption: 'paypal' as const },
      { creatorProfileId: f.profile.id, submissionId: f.first.id, amountCents: 9999, status: 'cancelled' as const, paymentOption: 'paypal' as const },
    ]).returning()
    const request = await payouts.requestBundledPayout(f.userId, 3000)
    const payments = await records(f.profile.id)
    expect(payments.find(p => p.id === pending.id)?.payoutRequestId).toBe(request.id)
    expect(payments.filter(p => p.payoutRequestId === request.id).reduce((sum, p) => sum + p.amountCents, 0)).toBe(3000)
    expect(payments.find(p => p.status === 'processing')?.payoutRequestId).toBeNull()
  })

  test('a changed balance is rejected with no partial reservations', async () => {
    const f = await fixture()
    await expect(payouts.requestBundledPayout(f.userId, 3400)).rejects.toMatchObject({ status: 409 })
    expect(await records(f.profile.id)).toHaveLength(1)
    expect(await database.db.query.creatorPayoutRequests.findMany({ where: eq(database.schema.creatorPayoutRequests.creatorProfileId, f.profile.id) })).toHaveLength(0)
  })

  test('one atomic settlement attaches shared proof and retries do not pay twice', async () => {
    const f = await fixture()
    const { db, schema } = database
    const request = await payouts.requestBundledPayout(f.userId, 3500)
    await expect(payouts.settleBundledPayout({ id: request.id, expectedAmountCents: 3499 })).rejects.toMatchObject({ status: 409 })
    await db.update(schema.creatorProfiles).set({ paypalEmail: 'new@bundle-test.local' }).where(eq(schema.creatorProfiles.id, f.profile.id))
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer()
    const input = { id: request.id, expectedAmountCents: 3500, providerReference: 'Combined transfer test', receiptImage: `data:image/png;base64,${image.toString('base64')}` }
    const results = await Promise.all([payouts.settleBundledPayout(input), payouts.settleBundledPayout(input)])
    expect(results.every(r => r.status === 'paid')).toBe(true)
    expect(results[0].destination).toBe('original@bundle-test.local')
    const payments = await records(f.profile.id)
    expect(payments).toHaveLength(3)
    expect(payments.reduce((sum, p) => sum + (p.status === 'paid' ? p.amountCents : 0), 0)).toBe(5000)
    const proof = await Promise.all(payments.filter(p => p.payoutRequestId === request.id).map(p => db.query.creatorPaymentReceipts.findFirst({ where: eq(schema.creatorPaymentReceipts.paymentId, p.id) })))
    expect(proof.every(Boolean)).toBe(true)
    expect(proof[0]?.image).toBe(proof[1]?.image)
    const subs = await db.query.creatorSubmissions.findMany({ where: eq(schema.creatorSubmissions.creatorProfileId, f.profile.id) })
    expect(subs.every(s => s.status === 'paid')).toBe(true)
  })

  test('later earnings wait for a new request instead of changing the requested total', async () => {
    const f = await fixture()
    const { db, schema } = database
    const first = await payouts.requestBundledPayout(f.userId, 3500)
    const [later] = await db.insert(schema.creatorSubmissions).values({ creatorProfileId: f.profile.id, sprintId: f.sprint.id, title: 'Later video', platform: 'tiktok', status: 'approved', approvedAmountCents: 600 }).returning()
    expect((await payouts.requestBundledPayout(f.userId, 4100)).id).toBe(first.id)
    await payouts.settleBundledPayout({ id: first.id, expectedAmountCents: 3500 })
    const next = await payouts.requestBundledPayout(f.userId, 600)
    expect(next.amountCents).toBe(600)
    expect((await records(f.profile.id)).filter(p => p.payoutRequestId === next.id).map(p => p.submissionId)).toEqual([later.id])
  })

  test('open bundles prevent mode changes, individual settlement and separate scheduling', async () => {
    const f = await fixture()
    const request = await payouts.requestBundledPayout(f.userId, 3500)
    await expect(payouts.setBundledPayouts(f.userId, false)).rejects.toMatchObject({ status: 409 })
    const payment = (await records(f.profile.id)).find(p => p.payoutRequestId === request.id)!
    await expect(admin.reviewCreatorResource({ resource: 'payment', id: payment.id, status: 'paid' })).rejects.toMatchObject({ status: 409 })
    await expect(admin.createCreatorPayment({ submissionId: f.first.id, adminViewCountThreshold: 50_000, adminUsAudiencePercent: 40, status: 'pending' })).rejects.toMatchObject({ status: 409 })
  })

  test('zero balances, unapproved payout methods and suspended creators cannot request', async () => {
    const f = await fixture()
    const { db, schema } = database
    await db.update(schema.creatorProfiles).set({ authStatus: 'suspended' }).where(eq(schema.creatorProfiles.id, f.profile.id))
    await expect(payouts.requestBundledPayout(f.userId, 3500)).rejects.toMatchObject({ status: 409 })
    await db.update(schema.creatorProfiles).set({ authStatus: 'verified', paypalEmail: null }).where(eq(schema.creatorProfiles.id, f.profile.id))
    await expect(payouts.requestBundledPayout(f.userId, 3500)).rejects.toMatchObject({ status: 409 })
    await expect(payouts.requestBundledPayout('someone-else', 3500)).rejects.toMatchObject({ status: 409 })
    await db.update(schema.creatorProfiles).set({ paypalEmail: 'valid@bundle-test.local' }).where(eq(schema.creatorProfiles.id, f.profile.id))
    await db.update(schema.creatorSubmissions).set({ approvedAmountCents: 0 }).where(eq(schema.creatorSubmissions.creatorProfileId, f.profile.id))
    await expect(payouts.requestBundledPayout(f.userId, 1)).rejects.toMatchObject({ status: 409 })
  })

  test('settling vested earnings during rereview does not close the review', async () => {
    const f = await fixture()
    const { db, schema } = database
    await db.update(schema.creatorSubmissions).set({ status: 'in_review' }).where(eq(schema.creatorSubmissions.id, f.first.id))
    const request = await payouts.requestBundledPayout(f.userId, 3500)
    await payouts.settleBundledPayout({ id: request.id, expectedAmountCents: 3500 })
    expect((await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, f.first.id) }))?.status).toBe('in_review')
  })

  test('manual scheduled payments join the same bundle and foreign currencies fail closed', async () => {
    const f = await fixture()
    const { db, schema } = database
    await db.insert(schema.creatorPayments).values({ creatorProfileId: f.profile.id, amountCents: 400, status: 'pending', paymentOption: 'paypal' })
    const request = await payouts.requestBundledPayout(f.userId, 3900)
    expect((await records(f.profile.id)).filter(p => p.payoutRequestId === request.id).reduce((sum, p) => sum + p.amountCents, 0)).toBe(3900)
    const other = await fixture()
    await db.insert(schema.creatorPayments).values({ creatorProfileId: other.profile.id, submissionId: other.first.id, amountCents: 100, currency: 'EUR', status: 'pending', paymentOption: 'paypal' })
    await expect(payouts.requestBundledPayout(other.userId, 3500)).rejects.toMatchObject({ status: 409 })
  })

  test('over-reserved scheduled amounts fail before reserving any additional earnings', async () => {
    const f = await fixture()
    const { db, schema } = database
    await db.insert(schema.creatorPayments).values({ creatorProfileId: f.profile.id, submissionId: f.first.id, amountCents: 2100, status: 'pending', paymentOption: 'paypal' })
    await expect(payouts.requestBundledPayout(f.userId, 3600)).rejects.toMatchObject({ status: 409 })
    expect((await records(f.profile.id)).some(p => p.payoutRequestId)).toBe(false)
  })

  test('a bundle with an unexpected individually-paid line fails atomically', async () => {
    const f = await fixture()
    const { db, schema } = database
    const request = await payouts.requestBundledPayout(f.userId, 3500)
    const payment = (await records(f.profile.id)).find(p => p.payoutRequestId === request.id)!
    await db.update(schema.creatorPayments).set({ status: 'paid' }).where(eq(schema.creatorPayments.id, payment.id))
    await expect(payouts.settleBundledPayout({ id: request.id, expectedAmountCents: 3500 })).rejects.toMatchObject({ status: 409 })
    expect((await records(f.profile.id)).filter(p => p.payoutRequestId === request.id && p.status === 'pending')).toHaveLength(1)
    expect((await db.query.creatorPayoutRequests.findFirst({ where: eq(schema.creatorPayoutRequests.id, request.id) }))?.status).toBe('pending')
  })

  test('a transfer already processing can finish separately without closing unpaid bundle earnings', async () => {
    const f = await fixture()
    const { db, schema } = database
    const [processing] = await db.insert(schema.creatorPayments).values({ creatorProfileId: f.profile.id, submissionId: f.first.id, amountCents: 500, status: 'processing', paymentOption: 'paypal' }).returning()
    const request = await payouts.requestBundledPayout(f.userId, 3000)
    await admin.reviewCreatorResource({ resource: 'payment', id: processing.id, status: 'paid' })
    expect((await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, f.first.id) }))?.status).toBe('approved')
    await payouts.settleBundledPayout({ id: request.id, expectedAmountCents: 3000 })
    expect((await records(f.profile.id)).reduce((sum, p) => sum + (p.status === 'paid' ? p.amountCents : 0), 0)).toBe(5000)
  })
})
