import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomBytes, randomUUID } from 'node:crypto'

const url = process.env.GUEST_TEST_DATABASE_URL
const enabled = Boolean(url && ['127.0.0.1', 'localhost'].includes(new URL(url).hostname))
let db: typeof import('@/lib/db').db, schema: typeof import('@/lib/db').schema
let eq: typeof import('drizzle-orm').eq
let guests: typeof import('./mobile-guest'), credits: typeof import('@/lib/payments/entitlements')
let requestUser: typeof import('./mobile-session').getRequestUserId
const subscribers = new Map<string, unknown>()
const originalFetch = globalThis.fetch
const key = () => randomBytes(32).toString('hex')

// Explicit local-only opt-in; these tests must never touch the production database.
describe.skipIf(!enabled)('guest accounts and scan ledger (isolated PostgreSQL)', () => {
  beforeAll(async () => {
    const databaseUrl = new URL(url!)
    databaseUrl.searchParams.set('options', '-c timezone=UTC')
    process.env.DATABASE_URL = databaseUrl.toString()
    process.env.REVENUECAT_SECRET_API_KEY = 'guest-integration-test-only'
    const database = await import('@/lib/db'); db = database.db; schema = database.schema
    eq = (await import('drizzle-orm')).eq
    guests = await import('./mobile-guest')
    credits = await import('@/lib/payments/entitlements')
    requestUser = (await import('./mobile-session')).getRequestUserId
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const address = String(input)
      if (!address.startsWith('https://api.revenuecat.com/v1/subscribers/')) throw new Error('Unexpected external request in guest tests')
      const subscriber = subscribers.get(decodeURIComponent(address.split('/').pop()!))
      return new Response(JSON.stringify(subscriber ? { subscriber } : {}), { status: subscriber ? 200 : 404 })
    }) as typeof fetch
  })
  afterAll(() => { globalThis.fetch = originalFetch })

  test('released clients keep their credential sessions, cookie sessions and response shape without guest fields', async () => {
    const auth = await import('./mobile-session')
    const { hashPassword } = await import('./password')
    const id = randomUUID(), email = `${id}@test.invalid`, password = key()
    await db.insert(schema.users).values({ id, email, passwordHash: await hashPassword(password) })
    const session = await auth.createMobileSessionFromCredentials({ email, password })
    expect(Object.keys(session).sort()).toEqual(['expires', 'sessionToken', 'userId'])
    expect(session.userId).toBe(id)
    expect(await requestUser({ headers: { authorization: `Bearer ${session.sessionToken}` } } as any, {} as any)).toBe(id)
    expect(await db.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, id) })).toBeUndefined()

    const { encode } = await import('next-auth/jwt')
    const { authOptions } = await import('./options')
    const cookie = await encode({ secret: authOptions.secret!, token: { id, sub: id, email } })
    const req = { headers: {}, cookies: { 'next-auth.session-token': cookie }, query: {} } as any
    const res = { getHeader() {}, setHeader() {}, setCookie() {} } as any
    expect(await requestUser(req, res)).toBe(id)
    expect(await requestUser({ ...req, headers: { authorization: `Bearer ${key()}` } }, res)).toBeNull()
  })

  test('released subscription clients retain allowance, spent credits and restore idempotency without guest registration', async () => {
    const id = randomUUID(), transaction = randomUUID()
    await db.insert(schema.users).values({ id, email: `${id}@test.invalid` })
    subscribers.set(id, {
      entitlements: { pro: { product_identifier: 'mogging.pro.monthly', expires_date: new Date(Date.now() + 30 * 86400000).toISOString() } },
      subscriptions: { 'mogging.pro.monthly': { purchase_date: new Date(Date.now() - 1000).toISOString(), expires_date: new Date(Date.now() + 30 * 86400000).toISOString(), store_transaction_id: transaction, store: 'app_store', is_sandbox: false } },
    })
    const owner = { userId: id, mobileInstallId: 'released-client-install' }
    const initial = await credits.getEntitlementSummary(owner)
    expect(initial.evaluationCredits).toBe(2)
    expect(initial.subscription.active).toBe(true)
    expect(Object.keys(initial).sort()).toEqual(['evaluationCredits', 'extras', 'mobileInstallId', 'subscription'])
    const scan = await credits.reserveEvaluation(owner, 'legacy-scan', 'photo')
    await credits.finishEvaluation(scan.id, { analysis: { status: 'complete' } }, true)
    await credits.syncRevenueCatScans(id, owner.mobileInstallId)
    expect((await credits.getEntitlementSummary(owner)).evaluationCredits).toBe(1)
    expect(await db.query.mobileGuests.findFirst({ where: eq(schema.mobileGuests.userId, id) })).toBeUndefined()
  })

  test('concurrent guest creation is idempotent and never grants free access', async () => {
    const secret = key()
    const sessions = await Promise.all(Array.from({ length: 5 }, () => guests.createGuestSession(secret)))
    expect(new Set(sessions.map(s => s.userId)).size).toBe(1)
    expect(sessions.every(s => s.token.length >= 32 && s.guest)).toBe(true)
    expect((await credits.getEntitlementSummary({ userId: sessions[0].userId })).evaluationCredits).toBe(0)
    await expect(credits.reserveEvaluation({ userId: sessions[0].userId }, randomUUID(), 'photo')).rejects.toMatchObject({ status: 402 })
  })

  test('concurrent requests cannot spend one credit twice; failure refunds only once', async () => {
    const guest = await guests.createGuestSession(key())
    await db.insert(schema.paymentEntitlements).values({ userId: guest.userId, mobileInstallId: 'local-test', stripeCheckoutSessionId: randomUUID(), product: 'evaluation', creditBalance: 1, source: 'test' })
    const results = await Promise.allSettled(['one', 'two'].map(id => credits.reserveEvaluation({ userId: guest.userId }, id, 'photo')))
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const success = results.find(r => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof credits.reserveEvaluation>>>
    expect((await credits.getEntitlementSummary({ userId: guest.userId })).evaluationCredits).toBe(0)
    await credits.finishEvaluation(success.value.id, { analysis: { status: 'failed' } }, false)
    await credits.finishEvaluation(success.value.id, { analysis: { status: 'failed' } }, false)
    expect((await credits.getEntitlementSummary({ userId: guest.userId })).evaluationCredits).toBe(1)
  })

  test('claiming preserves reports and spent balances, revokes guest credentials, and is retry-safe', async () => {
    const secret = key(), guest = await guests.createGuestSession(secret), targetId = randomUUID()
    await db.insert(schema.users).values({ id: targetId, email: `${targetId}@test.invalid` })
    await db.insert(schema.paymentEntitlements).values({ userId: guest.userId, mobileInstallId: 'local-test', stripeCheckoutSessionId: randomUUID(), product: 'evaluation', creditBalance: 1, source: 'test' })
    const reservation = await credits.reserveEvaluation({ userId: guest.userId }, 'claim-scan', 'photo')
    await expect(guests.claimGuestAccount(targetId, secret)).rejects.toMatchObject({ status: 409 })
    await credits.finishEvaluation(reservation.id, { analysis: { status: 'complete' } }, true)
    const [photo] = await db.insert(schema.photos).values({ userId: guest.userId, imageUrl: 'https://test.invalid/photo.jpg', imageHash: randomUUID(), gender: 'other', photoType: 'face' }).returning()
    await db.insert(schema.analyses).values({ photoId: photo.id, status: 'complete' })
    await guests.claimGuestAccount(targetId, secret)
    await guests.claimGuestAccount(targetId, secret)
    expect((await db.query.photos.findFirst({ where: eq(schema.photos.id, photo.id) }))?.userId).toBe(targetId)
    expect((await credits.getEntitlementSummary({ userId: targetId })).evaluationCredits).toBe(0)
    await expect(guests.createGuestSession(secret)).rejects.toMatchObject({ status: 409 })
    expect(await requestUser({ headers: { authorization: `Bearer ${guest.token}` } } as any, {} as any)).toBeNull()
    await expect(credits.reserveEvaluation({ userId: guest.userId }, 'post-claim', 'photo')).rejects.toMatchObject({ status: 401 })
    await expect(guests.claimGuestAccount(randomUUID(), secret)).rejects.toMatchObject({ status: 409 })
  })

  test('RevenueCat guest billing continues after saving to an existing account without replenishing spent scans', async () => {
    const secret = key(), guest = await guests.createGuestSession(secret), targetId = randomUUID()
    await db.insert(schema.users).values({ id: targetId, email: `${targetId}@test.invalid` })
    const transaction = randomUUID()
    subscribers.set(guest.userId, {
      entitlements: { pro: { product_identifier: 'mogging.pro.monthly', expires_date: new Date(Date.now() + 30 * 86400000).toISOString() } },
      subscriptions: { 'mogging.pro.monthly': { purchase_date: new Date(Date.now() - 1000).toISOString(), expires_date: new Date(Date.now() + 30 * 86400000).toISOString(), store_transaction_id: transaction, store: 'app_store', is_sandbox: true } },
    })
    const allowance = await credits.getEntitlementSummary({ userId: guest.userId })
    expect(allowance.evaluationCredits).toBeGreaterThan(0)
    for (let i = 0; i < allowance.evaluationCredits; i++) {
      const reservation = await credits.reserveEvaluation({ userId: guest.userId }, `paid-${i}`, 'photo')
      await credits.finishEvaluation(reservation.id, { analysis: { status: 'complete' } }, true)
    }
    await guests.claimGuestAccount(targetId, secret)
    const restored = await credits.getEntitlementSummary({ userId: targetId })
    expect(restored.subscription.active).toBe(true)
    expect(restored.evaluationCredits).toBe(0)
    const attacker = await guests.createGuestSession(key())
    subscribers.set(attacker.userId, subscribers.get(guest.userId))
    expect((await credits.getEntitlementSummary({ userId: attacker.userId })).evaluationCredits).toBe(0)
    await expect(credits.reserveEvaluation({ userId: attacker.userId }, 'replay', 'photo')).rejects.toMatchObject({ status: 402 })
  })

  test('verified store recovery returns the same guest and cannot reclaim a registered account or mint credits', async () => {
    const secret = key(), guest = await guests.createGuestSession(secret), transaction = randomUUID()
    await db.insert(schema.paymentEntitlements).values({ userId: guest.userId, mobileInstallId: 'local-test', stripeCheckoutSessionId: `revenuecat-subscription:app_store:${transaction}`, product: 'mobile_subscription_monthly', creditBalance: 0, source: 'revenuecat_subscription', metadata: { sandbox: true } })
    const proof = { transactionId: transaction, originalTransactionId: transaction, environment: 'Sandbox' } as any
    const result = await guests.recoverGuestPurchase(proof)
    expect(result.session?.userId).toBe(guest.userId)
    expect((await credits.getEntitlementSummary({ userId: guest.userId })).evaluationCredits).toBe(0)
    if (!('recoveryKey' in result)) throw new Error('Recovery key missing')
    expect((await guests.createGuestSession(result.recoveryKey!)).userId).toBe(guest.userId)
    expect((await guests.createGuestSession(secret)).userId).toBe(guest.userId)
    expect((await guests.recoverGuestPurchase({ ...proof, environment: 'Production' })).session).toBeNull()
    const targetId = randomUUID()
    await db.insert(schema.users).values({ id: targetId, email: `${targetId}@test.invalid` })
    await guests.claimGuestAccount(targetId, secret)
    expect(await guests.recoverGuestPurchase(proof)).toEqual({ accountRequired: true, session: null })
    expect(await requestUser({ headers: { authorization: `Bearer ${result.session!.token}` } } as any, {} as any)).toBeNull()
  })

  test('report recovery is owner-scoped and paginates equal timestamps without dropping reports', async () => {
    const guest = await guests.createGuestSession(key()), other = await guests.createGuestSession(key())
    const timestamp = new Date('2026-01-01T00:00:00Z')
    for (let i = 0; i < 52; i++) {
      const [photo] = await db.insert(schema.photos).values({ userId: i === 51 ? other.userId : guest.userId, imageUrl: 'https://test.invalid/photo.jpg', imageHash: randomUUID(), gender: 'other', photoType: 'face' }).returning()
      await db.insert(schema.analyses).values({ photoId: photo.id, status: 'complete', createdAt: timestamp })
    }
    const { handler } = await import('@/pages/api/mobile/reports')
    async function page(before?: string) {
      let data: any, status: number
      const res: any = { setHeader() {}, status(value: number) { status = value; return this }, json(value: unknown) { data = value; return this } }
      await handler({ method: 'GET', query: before ? { before } : {}, headers: { authorization: `Bearer ${guest.token}` } } as any, res)
      expect(status!).toBe(200)
      return data.data
    }
    const first = await page(), second = await page(first.next)
    expect(first.reports).toHaveLength(50)
    expect(second.reports).toHaveLength(1)
    expect(new Set([...first.reports, ...second.reports].map((row: any) => row.analysis.id)).size).toBe(51)
  })

  test('a lost bootstrap response cannot block a real sign-in, and random keys cannot move data', async () => {
    const target = randomUUID()
    await db.insert(schema.users).values({ id: target, email: `${target}@test.invalid` })
    expect(await guests.claimGuestAccount(target, key())).toBe(false)
    await expect(guests.createGuestSession(key(), true)).rejects.toMatchObject({ status: 404 })
  })

  test('referral links, progress and spent rewards survive claiming without granting another reward', async () => {
    const referral = await import('@/lib/referrals/service')
    const secret = key(), guest = await guests.createGuestSession(secret)
    const invite = await referral.getReferralLink(guest.userId)
    const ticket = await referral.createReferralTicket(invite.code)
    for (let i = 0; i < 3; i++) {
      const id = randomUUID()
      await db.insert(schema.users).values({ id, email: `${id}@test.invalid` })
      await referral.creditReferralSignup(id, ticket)
    }
    expect((await credits.getEntitlementSummary({ userId: guest.userId })).evaluationCredits).toBe(1)
    const spent = await credits.reserveEvaluation({ userId: guest.userId }, 'reward', 'photo')
    await credits.finishEvaluation(spent.id, { analysis: { status: 'complete' } }, true)
    const targetId = randomUUID()
    await db.insert(schema.users).values({ id: targetId, email: `${targetId}@test.invalid` })
    await guests.claimGuestAccount(targetId, secret)
    const after = await referral.getReferralLink(targetId)
    expect(after.code).toBe(invite.code)
    expect(after.reward).toEqual({ completed: 3, required: 3, granted: true, available: false })
    const id = randomUUID()
    await db.insert(schema.users).values({ id, email: `${id}@test.invalid` })
    await referral.creditReferralSignup(id, ticket)
    expect((await credits.getEntitlementSummary({ userId: targetId })).evaluationCredits).toBe(0)
  })

  test('original subscription binding recovers reports across a missed renewal without a fresh credit', async () => {
    const guest = await guests.createGuestSession(key()), attacker = await guests.createGuestSession(key()), transaction = randomUUID(), original = randomUUID()
    await db.insert(schema.paymentEntitlements).values({ userId: guest.userId, mobileInstallId: 'local-test', stripeCheckoutSessionId: `revenuecat-subscription:app_store:${transaction}`, product: 'mobile_subscription_monthly', creditBalance: 0, source: 'revenuecat_subscription', metadata: { sandbox: true } })
    const proof = { transactionId: transaction, originalTransactionId: original, environment: 'Sandbox' } as any
    expect(await guests.bindGuestPurchase(attacker.userId, proof)).toBe(false)
    expect(await guests.bindGuestPurchase(guest.userId, proof)).toBe(true)
    expect(await guests.bindGuestPurchase(guest.userId, proof)).toBe(true)
    const recovered = await guests.recoverGuestPurchase({ ...proof, transactionId: randomUUID() })
    expect(recovered.session?.userId).toBe(guest.userId)
    expect((await credits.getEntitlementSummary({ userId: guest.userId })).evaluationCredits).toBe(0)
  })

  test('saving a guest cannot count the owner as their third invited friend', async () => {
    const referral = await import('@/lib/referrals/service'), secret = key(), guest = await guests.createGuestSession(secret)
    const invite = await referral.getReferralLink(guest.userId), ticket = await referral.createReferralTicket(invite.code)
    for (let i = 0; i < 2; i++) {
      const id = randomUUID(); await db.insert(schema.users).values({ id, email: `${id}@test.invalid` }); await referral.creditReferralSignup(id, ticket)
    }
    const targetId = randomUUID(); await db.insert(schema.users).values({ id: targetId, email: `${targetId}@test.invalid` })
    await referral.creditReferralSignup(targetId, ticket)
    await guests.claimGuestAccount(targetId, secret)
    expect((await credits.getEntitlementSummary({ userId: targetId })).evaluationCredits).toBe(0)
    expect((await referral.getReferralLink(targetId)).reward.completed).toBe(2)
    const friend = randomUUID(); await db.insert(schema.users).values({ id: friend, email: `${friend}@test.invalid` })
    await referral.creditReferralSignup(friend, ticket)
    expect((await credits.getEntitlementSummary({ userId: targetId })).evaluationCredits).toBe(1)
  })

  test('forged, unsigned, or wrong-key Apple recovery proofs are rejected', async () => {
    const { verifyAppleTransaction } = await import('./apple-transaction')
    await expect(verifyAppleTransaction('not.a.transaction')).rejects.toMatchObject({ status: 403 })
    const payload = Buffer.from(JSON.stringify({ bundleId: 'app.mogging.scan', transactionId: 'fake', environment: 'Production' })).toString('base64url')
    await expect(verifyAppleTransaction(`eyJhbGciOiJub25lIn0.${payload}.`)).rejects.toMatchObject({ status: 403 })
  })
})
