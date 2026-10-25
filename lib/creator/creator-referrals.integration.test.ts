import { beforeAll, afterAll, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'

const url = process.env.TEST_CREATOR_REFERRAL_DATABASE_URL
let database: typeof import('@/lib/db')
let referrals: typeof import('./creator-referrals')
let service: typeof import('./service')
let bundles: typeof import('./bundled-payouts')

describe.skipIf(!url)('creator referrals isolated database integration', () => {
  beforeAll(async () => {
    const address = new URL(url!)
    if (address.hostname !== '127.0.0.1' || address.port !== '55449') throw new Error('Use the isolated localhost referral database on port 55449')
    process.env.DATABASE_URL = url
    database = await import('@/lib/db')
    referrals = await import('./creator-referrals')
    service = await import('./service')
    bundles = await import('./bundled-payouts')
    const [transfers] = await database.db.$client.unsafe("select to_regclass('creator_campaign_transfers') as name")
    if (!transfers.name) await database.db.$client.unsafe(await readFile(new URL('../../drizzle/0059_creator_campaign_transfers.sql', import.meta.url), 'utf8'))
    // Exercise the actual migration against the preceding payment shape, not just schema push.
    await database.db.$client.begin(async sql => {
      await sql.unsafe('TRUNCATE creator_payments CASCADE; ALTER TABLE creator_payments DROP COLUMN creator_referral_award_id CASCADE; DROP TABLE creator_referral_awards; DROP TABLE creator_referrals; DROP TABLE creator_referral_links')
      await sql.unsafe("ALTER TABLE creator_payments ADD CONSTRAINT creator_payments_bonus_shape CHECK ((bonus_sprint_id IS NULL AND bonus_key IS NULL AND bonus_note IS NULL) OR (bonus_sprint_id IS NOT NULL AND bonus_key IS NOT NULL AND bonus_note IS NOT NULL AND submission_id IS NULL AND currency = 'USD' AND amount_cents > 0))")
      await sql.unsafe(await readFile(new URL('../../drizzle/0062_creator_referrals.sql', import.meta.url), 'utf8'))
    })
  })
  afterAll(async () => { if (database) await database.db.$client.end() })

  async function user() {
    const id = crypto.randomUUID()
    await database.db.insert(database.schema.users).values({ id, email: id + '@referral-test.invalid' })
    return id
  }
  async function fixture() {
    const { db, schema } = database
    const inviter = await service.getOrCreateCreatorProfile(await user())
    await db.update(schema.creatorProfiles).set({ authStatus: 'verified', paypalEmail: inviter.id + '@paypal.invalid', bundledPayouts: true }).where(eq(schema.creatorProfiles.id, inviter.id))
    const report = await referrals.getCreatorReferralReport(inviter.userId)
    const code = report!.inviteUrl.split('/').pop()!
    const invitee = await service.getOrCreateCreatorProfile(await user(), code)
    await db.update(schema.creatorProfiles).set({ authStatus: 'verified', paypalEmail: invitee.id + '@paypal.invalid' }).where(eq(schema.creatorProfiles.id, invitee.id))
    await db.insert(schema.creatorSocialAccounts).values({ creatorProfileId: invitee.id, platform: 'tiktok', handle: invitee.id, connectionMethod: 'manual', status: 'approved' })
    return { inviter, invitee, code }
  }
  async function approved(inviteeId: string, count = 1) {
    const { db, schema } = database
    const posts = await db.insert(schema.creatorSubmissions).values(Array.from({ length: count }, (_, i) => ({ creatorProfileId: inviteeId, title: 'Video ' + i, platform: 'tiktok', status: 'approved' as const, approvedAmountCents: 10000 }))).returning()
    await Promise.all(posts.map(post => db.transaction(tx => referrals.reserveCreatorReferralVideo(tx, post.id))))
    return posts
  }
  async function paid(creatorId: string, postId: string, cents: number, status: 'paid' | 'pending' = 'paid') {
    return database.db.insert(database.schema.creatorPayments).values({ creatorProfileId: creatorId, submissionId: postId, paymentOption: 'paypal', amountCents: cents, status, paidAt: status === 'paid' ? new Date() : null }).returning()
  }
  async function bonuses(inviterId: string) {
    return (await database.db.query.creatorPayments.findMany({ where: eq(database.schema.creatorPayments.creatorProfileId, inviterId) })).filter(payment => payment.creatorReferralAwardId)
  }

  test('registration is atomic, immutable, new-creators-only, and prevents self referrals', async () => {
    const first = await fixture(), second = await fixture()
    const fresh = await user()
    const profiles = await Promise.all([service.getOrCreateCreatorProfile(fresh, first.code), service.getOrCreateCreatorProfile(fresh, second.code)])
    expect(profiles[0].id).toBe(profiles[1].id)
    const relation = await database.db.query.creatorReferrals.findFirst({ where: eq(database.schema.creatorReferrals.inviteeId, profiles[0].id) })
    expect([first.inviter.id, second.inviter.id]).toContain(relation!.inviterId)
    await service.getOrCreateCreatorProfile(first.inviter.userId, first.code)
    expect(await database.db.query.creatorReferrals.findFirst({ where: eq(database.schema.creatorReferrals.inviteeId, first.inviter.id) })).toBeUndefined()
    const existing = await service.getOrCreateCreatorProfile(await user())
    await service.getOrCreateCreatorProfile(existing.userId, first.code)
    expect(await database.db.query.creatorReferrals.findFirst({ where: eq(database.schema.creatorReferrals.inviteeId, existing.id) })).toBeUndefined()
  })

  test('concurrent approvals cap at five unique videos and rereviews never consume extra slots', async () => {
    const f = await fixture()
    const posts = await approved(f.invitee.id, 8)
    const awards = await database.db.query.creatorReferralAwards.findMany({ where: eq(database.schema.creatorReferralAwards.inviteeId, f.invitee.id) })
    expect(awards).toHaveLength(5)
    expect(awards.map(award => award.slot).sort()).toEqual([1, 2, 3, 4, 5])
    await Promise.all(posts.map(post => database.db.transaction(tx => referrals.reserveCreatorReferralVideo(tx, post.id))))
    expect(await database.db.query.creatorReferralAwards.findMany({ where: eq(database.schema.creatorReferralAwards.inviteeId, f.invitee.id) })).toHaveLength(5)
    for (const post of posts) await paid(f.invitee.id, post.id, 1000)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    expect((await bonuses(f.inviter.id)).reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(250)
  })

  test('no commission on approval alone; partial payments round cumulatively and retries stay idempotent', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await paid(f.invitee.id, post.id, 5000, 'pending')
    expect(await referrals.syncCreatorReferralBonuses(f.invitee.id)).toBe(0)
    await paid(f.invitee.id, post.id, 19)
    expect(await referrals.syncCreatorReferralBonuses(f.invitee.id)).toBe(0)
    await paid(f.invitee.id, post.id, 1)
    await Promise.all(Array.from({ length: 8 }, () => referrals.syncCreatorReferralBonuses(f.invitee.id)))
    expect((await bonuses(f.inviter.id)).map(payment => payment.amountCents)).toEqual([1])
    await paid(f.invitee.id, post.id, 1980)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    expect((await bonuses(f.inviter.id)).reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(100)
    expect((await referrals.getCreatorReferralReport(f.inviter.userId))?.outstandingCents).toBe(100)
  })

  test('creator and campaign bonuses do not generate referral-on-bonus commissions', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await database.db.insert(database.schema.creatorPayments).values({ creatorProfileId: f.invitee.id, submissionId: null, paymentOption: 'paypal', amountCents: 50000, status: 'paid', paidAt: new Date() })
    await paid(f.invitee.id, post.id, 2000)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    expect((await bonuses(f.inviter.id)).reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(100)
  })

  test('existing requested bundles stay unchanged when later referral bonuses accrue', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await paid(f.invitee.id, post.id, 2000)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    const request = await bundles.requestBundledPayout(f.inviter.userId, 100)
    await paid(f.invitee.id, post.id, 2000)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    const payments = await bonuses(f.inviter.id)
    expect(payments.filter(payment => payment.payoutRequestId === request.id).reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(100)
    expect(payments.filter(payment => !payment.payoutRequestId).reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(100)
    expect((await database.db.query.creatorPayoutRequests.findFirst({ where: eq(database.schema.creatorPayoutRequests.id, request.id) }))?.amountCents).toBe(100)
  })

  test('manual cancellation is not reissued, suspended creators and shared payout identities are held', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await paid(f.invitee.id, post.id, 2000)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    const [bonus] = await bonuses(f.inviter.id)
    await database.db.update(database.schema.creatorPayments).set({ status: 'cancelled' }).where(eq(database.schema.creatorPayments.id, bonus.id))
    expect(await referrals.syncCreatorReferralBonuses(f.invitee.id)).toBe(0)
    const other = await fixture()
    const [otherPost] = await approved(other.invitee.id)
    await paid(other.invitee.id, otherPost.id, 2000)
    await database.db.update(database.schema.creatorProfiles).set({ paypalEmail: other.inviter.id + '@paypal.invalid' }).where(eq(database.schema.creatorProfiles.id, other.invitee.id))
    expect(await referrals.syncCreatorReferralBonuses(other.invitee.id)).toBe(0)
    expect((await referrals.getCreatorReferralReport(other.inviter.userId))?.referrals[0].status).toBe('on_hold')
    await database.db.update(database.schema.creatorProfiles).set({ authStatus: 'suspended' }).where(eq(database.schema.creatorProfiles.id, f.invitee.id))
    await paid(f.invitee.id, post.id, 2000)
    expect(await referrals.syncCreatorReferralBonuses(f.invitee.id)).toBe(0)
  })
  test('real approval history and individual payment review automatically create one referral credit', async () => {
    const f = await fixture()
    const [post] = await database.db.insert(database.schema.creatorSubmissions).values({ creatorProfileId: f.invitee.id, title: 'Approved through history', platform: 'tiktok', status: 'approved', approvedAmountCents: 2000 }).returning()
    const { recordSubmissionUpdate } = await import('./submission-updates')
    await database.db.transaction(tx => recordSubmissionUpdate(tx, post.id, 'approved'))
    const [payment] = await paid(f.invitee.id, post.id, 2000, 'pending')
    const { reviewCreatorResource } = await import('@/lib/admin/creator-service')
    await reviewCreatorResource({ resource: 'payment', id: payment.id, status: 'paid' })
    await reviewCreatorResource({ resource: 'payment', id: payment.id, status: 'paid' })
    expect((await bonuses(f.inviter.id)).map(payment => payment.amountCents)).toEqual([100])
    expect((await database.db.query.creatorPayments.findFirst({ where: eq(database.schema.creatorPayments.id, payment.id) }))?.amountCents).toBe(2000)
  })

  test('settling the invitee bundle accrues a referral bonus and the inviter can cash it out once', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await database.db.update(database.schema.creatorSubmissions).set({ approvedAmountCents: 2000 }).where(eq(database.schema.creatorSubmissions.id, post.id))
    await database.db.update(database.schema.creatorProfiles).set({ bundledPayouts: true }).where(eq(database.schema.creatorProfiles.id, f.invitee.id))
    const source = await bundles.requestBundledPayout(f.invitee.userId, 2000)
    await bundles.settleBundledPayout({ id: source.id, expectedAmountCents: 2000 })
    expect((await bonuses(f.inviter.id)).map(payment => payment.amountCents)).toEqual([100])
    const reward = await bundles.requestBundledPayout(f.inviter.userId, 100)
    await bundles.settleBundledPayout({ id: reward.id, expectedAmountCents: 100 })
    await bundles.settleBundledPayout({ id: reward.id, expectedAmountCents: 100 })
    const report = await referrals.getCreatorReferralReport(f.inviter.userId)
    expect(report?.paidCents).toBe(100)
    expect(report?.outstandingCents).toBe(0)
    const sourcePayments = await database.db.query.creatorPayments.findMany({ where: eq(database.schema.creatorPayments.payoutRequestId, source.id) })
    expect(sourcePayments.reduce((sum, payment) => sum + payment.amountCents, 0)).toBe(2000)
  })

  test('payout-time eligibility checks hold a requested referral bundle after identities change', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await paid(f.invitee.id, post.id, 2000)
    await referrals.syncCreatorReferralBonuses(f.invitee.id)
    const reward = await bundles.requestBundledPayout(f.inviter.userId, 100)
    await database.db.update(database.schema.creatorProfiles).set({ paypalEmail: f.inviter.id + '@paypal.invalid' }).where(eq(database.schema.creatorProfiles.id, f.invitee.id))
    await expect(bundles.settleBundledPayout({ id: reward.id, expectedAmountCents: 100 })).rejects.toThrow('eligibility needs admin review')
    expect((await bonuses(f.inviter.id))[0].status).toBe('pending')
  })

  test('pending, failed, cancelled and foreign-currency post transfers do not generate credit', async () => {
    const f = await fixture()
    const [post] = await approved(f.invitee.id)
    await database.db.insert(database.schema.creatorPayments).values([
      { creatorProfileId: f.invitee.id, submissionId: post.id, amountCents: 10000, currency: 'EUR', paymentOption: 'paypal', status: 'paid', paidAt: new Date() },
      ...(['pending', 'failed', 'cancelled'] as const).map(status => ({ creatorProfileId: f.invitee.id, submissionId: post.id, amountCents: 10000, paymentOption: 'paypal' as const, status, paidAt: null })),
    ])
    expect(await referrals.syncCreatorReferralBonuses(f.invitee.id)).toBe(0)
    expect(await bonuses(f.inviter.id)).toHaveLength(0)
  })

  test('public join redirect keeps the first signed referral cookie across another creator link', async () => {
    const first = await fixture(), second = await fixture()
    const { getServerSideProps } = await import('@/pages/creator/join/[code]')
    const { CREATOR_INVITER_COOKIE, readCreatorInviter } = await import('./creator-referral-cookie')
    const headers = new Map<string, string>()
    const req = { cookies: {} as Record<string, string> }
    process.env.NEXTAUTH_SECRET ||= 'isolated-creator-referral-cookie-secret'
    const result = await getServerSideProps({ params: { code: first.code }, req, res: { setHeader: (name: string, value: string) => headers.set(name, value) } } as never)
    expect(result).toMatchObject({ redirect: { destination: '/creator', permanent: false } })
    const signed = headers.get('Set-Cookie')!.split(';')[0].slice(CREATOR_INVITER_COOKIE.length + 1)
    expect(readCreatorInviter(signed)).toBe(first.code)
    req.cookies[CREATOR_INVITER_COOKIE] = signed
    headers.clear()
    await getServerSideProps({ params: { code: second.code }, req, res: { setHeader: (name: string, value: string) => headers.set(name, value) } } as never)
    expect(headers.has('Set-Cookie')).toBe(false)
  })

})
