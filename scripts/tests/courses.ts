// This script runs in its own process so provider mocks cannot affect the existing test suite.
import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import postgres from 'postgres'
import { eq } from 'drizzle-orm'
import Stripe from 'stripe'
import { Readable } from 'node:stream'

const testUrl = process.env.COURSE_TEST_DATABASE_URL
if (!testUrl) throw new Error('Set COURSE_TEST_DATABASE_URL to an empty disposable local database named mogging_courses_test')
const parsed = new URL(testUrl)
if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.pathname !== '/mogging_courses_test') throw new Error('Course integration tests require the dedicated local test database')
process.env.DATABASE_URL = testUrl
process.env.COURSES_ENABLED = 'true'
process.env.COURSE_LIVE_PAYMENTS_ENABLED = 'false'
process.env.COURSE_STRIPE_TAX_ENABLED = 'true'
process.env.NEXTAUTH_URL = 'http://localhost:3000'
process.env.COURSE_STRIPE_SECRET_KEY = 'sk_test_course_mock'
process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_course_mock'
process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET = 'whsec_course_account_mock'
process.env.STRIPE_CONNECT_CLIENT_ID = 'ca_course_mock'
process.env.RESEND_API_KEY = 'course_mock'
process.env.BUNNY_STREAM_LIBRARY_ID = '123'
process.env.BUNNY_STREAM_API_KEY = 'course_mock'
process.env.BUNNY_STREAM_TOKEN_KEY = 'course_mock_token'
process.env.BUNNY_STREAM_READ_ONLY_KEY = 'course_mock_readonly'
delete process.env.UPSTASH_REDIS_REST_URL
delete process.env.UPSTASH_REDIS_REST_TOKEN
// Local provider setup must not leak into this fully mocked test process.
delete process.env.COURSE_R2_BUCKET_NAME
delete process.env.R2_ACCOUNT_ID
delete process.env.R2_ACCESS_KEY_ID
delete process.env.R2_SECRET_ACCESS_KEY
delete process.env.R2_BUCKET_NAME
delete process.env.R2_PUBLIC_BASE_URL
const setup = postgres(testUrl, { max: 1, prepare: false, onnotice: () => {} })
const [{ count }] = await setup<{ count: number }[]>`select count(*)::int as count from information_schema.tables where table_schema = 'public'`
assert.equal(count, 0, 'Test database must be empty; this script never drops existing data')
const exported = Bun.spawnSync(['bunx', '--no-install', 'drizzle-kit', 'export', '--dialect', 'postgresql', '--schema', './lib/db/schema.ts'], { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' })
assert.equal(exported.exitCode, 0, exported.stderr.toString())
await setup.unsafe(exported.stdout.toString())
const migration = await Bun.file('drizzle/0040_course_platform.sql').text() + '\n--> statement-breakpoint\n' + await Bun.file('drizzle/0042_course_watch_progress.sql').text()
for (const statement of migration.split('--> statement-breakpoint')) if (statement.trim()) await setup.unsafe(statement)
console.log('PASS: new migration applies against the existing schema')
await setup.end()

type Session = { id: string; url: string; status: string; payment_status: string; payment_intent: string | null; metadata: Record<string, string>; client_reference_id: string; livemode: boolean; currency: string; amount_subtotal: number; amount_total: number }
const sessions = new Map<string, Session>(), sessionKeys = new Map<string, string>(), charges = new Map<string, any>(), intents = new Map<string, any>(), disputes = new Map<string, any[]>(), refundKeys = new Map<string, any>()
let checkoutCreates = 0, refundCreates = 0, outboundEmails = 0, verificationCode = '', loseCheckoutResponse = false, expandedReads = false
let paymentReads = 0
let loseRefundResponse = false
let database: typeof import('@/lib/db')
const stripeSdk = new Stripe('sk_test_course_mock')
const stripeAccounts = new Map<string, any>()
const accountState = (id: string, country = 'US') => ({ id, object: 'v2.core.account', applied_configurations: ['merchant'], livemode: false, dashboard: 'full', identity: { country }, defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } }, configuration: { merchant: { capabilities: { card_payments: { status: 'active' }, stripe_balance: { payouts: { status: 'active' } } } } }, requirements: { entries: [] } })
stripeAccounts.set('acct_course_seller', accountState('acct_course_seller'))
let accountCreates = 0, accountReads = 0
let linkedConfigurations: string[] = []
const provider = {
  webhooks: stripeSdk.webhooks,
  parseEventNotificationAsync: stripeSdk.parseEventNotificationAsync.bind(stripeSdk),
  oauth: { token: async (_params: any, options: any) => { assert.equal(options.apiVersion, '2026-08-26.dahlia'); return { stripe_user_id: 'acct_course_oauth', livemode: false } } },
  accounts: { retrieve: async (id: string, _params: any, options: any) => {
    assert.equal(options.apiVersion, '2026-08-26.dahlia')
    const account = stripeAccounts.get(id)
    return { id, object: 'account', country: account.identity.country, controller: { stripe_dashboard: { type: account.dashboard }, fees: { payer: 'account' }, losses: { payments: 'stripe' } } }
  } },
  v2: { core: {
    accounts: {
      create: async (input: any, options: any) => {
        assert.equal(options.apiVersion, '2026-08-26.dahlia'); assert.ok(options.idempotencyKey)
        assert.equal(input.dashboard, 'full'); assert.deepEqual(input.defaults.responsibilities, { fees_collector: 'stripe', losses_collector: 'stripe' })
        assert.deepEqual(input.configuration, { merchant: { capabilities: { card_payments: { requested: true } } } })
        assert.deepEqual(input.identity, { country: 'us' }); assert.ok(input.contact_email)
        assert.ok(!JSON.stringify(input).includes('simulate_accept_tos')); assert.equal(input.configuration.customer, undefined)
        accountCreates++
        const account = accountState('acct_course_onboarding')
        stripeAccounts.set(account.id, account)
        return account
      },
      retrieve: async (id: string, params: any, options: any) => {
        assert.equal(options.apiVersion, '2026-08-26.dahlia')
        assert.deepEqual(params.include, ['configuration.merchant', 'defaults', 'identity', 'requirements'])
        accountReads++
        return structuredClone(stripeAccounts.get(id))
      },
    },
    accountLinks: { create: async (input: any, options: any) => {
      assert.equal(options.apiVersion, '2026-08-26.dahlia'); assert.equal(input.use_case.type, 'account_onboarding')
      linkedConfigurations = input.use_case.account_onboarding.configurations
      assert.deepEqual(linkedConfigurations, stripeAccounts.get(input.account).applied_configurations)
      assert.equal(input.use_case.account_onboarding.return_url, 'http://localhost:3000/creator/courses?connect=returned')
      return { url: 'https://connect.stripe.com/mock-onboarding', expires_at: new Date(Date.now() + 300_000).toISOString() }
    } },
  } },
  checkout: { sessions: {
    create: async (input: any, options: any) => {
      assert.equal(options.stripeAccount, 'acct_course_seller'); assert.ok(options.idempotencyKey); assert.equal(options.apiVersion, '2026-08-26.dahlia')
      assert.equal(input.payment_intent_data.application_fee_amount, undefined)
      if (sessionKeys.has(options.idempotencyKey)) return sessions.get(sessionKeys.get(options.idempotencyKey)!)
      checkoutCreates++
      const { courseOrders } = await import('@/lib/courses/schema')
      const order = await database.db.query.courseOrders.findFirst({ where: eq(courseOrders.id, input.client_reference_id) })
      const session: Session = { id: `cs_${checkoutCreates}`, url: `https://checkout.stripe.com/mock_${checkoutCreates}`, status: 'open', payment_status: 'unpaid', payment_intent: null, metadata: input.metadata, client_reference_id: input.client_reference_id, livemode: false, currency: order!.currency, amount_subtotal: order!.amount, amount_total: order!.amount + 500 }
      sessions.set(session.id, session); sessionKeys.set(options.idempotencyKey, session.id)
      if (loseCheckoutResponse) { loseCheckoutResponse = false; throw new Error('Simulated response lost after Stripe created Checkout') }
      return session
    },
    retrieve: async (id: string, params: any, options: any) => {
      assert.equal(options.stripeAccount, 'acct_course_seller')
      const session = sessions.get(id)!
      if (expandedReads && params.expand && session.payment_intent) {
        const intent = intents.get(session.payment_intent), charge = charges.get(intent.latest_charge)
        return { ...session, payment_intent: { ...intent, id: session.payment_intent, latest_charge: { ...charge, disputed: Boolean(disputes.get(charge.id)?.length) } } }
      }
      return session
    },
  } },
  products: { create: async () => ({ id: 'prod_course' }) }, prices: { create: async (_input: any, options: any) => ({ id: options.idempotencyKey }) },
  paymentIntents: { retrieve: async (id: string, _params: any, options: any) => { assert.equal(options.stripeAccount, 'acct_course_seller'); paymentReads++; return intents.get(id) } },
  charges: { retrieve: async (id: string, _params: any, options: any) => { assert.equal(options.stripeAccount, 'acct_course_seller'); return charges.get(id) } },
  disputes: { list: async (input: any) => ({ data: disputes.get(input.charge) || [] }) },
  refunds: { retrieve: async (id: string, _params: any, options: any) => { assert.equal(options.stripeAccount, 'acct_course_seller'); return [...refundKeys.values()].find(refund => refund.id === id) }, create: async (input: any, options: any) => {
    assert.equal(options.stripeAccount, 'acct_course_seller')
    if (refundKeys.has(options.idempotencyKey)) return refundKeys.get(options.idempotencyKey)
    refundCreates++
    const charge = charges.get(intents.get(input.payment_intent).latest_charge)
    assert.ok(charge.amount_refunded + input.amount <= charge.amount)
    charge.amount_refunded += input.amount
    const refund = { id: `re_${refundCreates}`, amount: input.amount, status: 'succeeded' }; refundKeys.set(options.idempotencyKey, refund)
    if (loseRefundResponse) { loseRefundResponse = false; throw new Error('Simulated response lost after Stripe refunded') }
    return refund
  } },
}
mock.module('@/lib/courses/stripe', () => ({ getCourseStripe: () => provider, courseStripeOptions: { apiVersion: '2026-08-26.dahlia' } }))
let requestUserId: string | null = null
mock.module('@/lib/auth/session', () => ({ getAuthSession: async () => requestUserId ? { user: { id: requestUserId } } : null }))
mock.module('@/lib/api/rateLimit', () => ({ enforceRateLimit: async () => {} }))
const realFetch = globalThis.fetch
const videos = new Map<string, any>()
globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const target = String(url)
  if (target === 'https://api.resend.com/emails') { outboundEmails++; const email = JSON.parse(String(init?.body)); verificationCode = email.text.split('\n\n')[1]; return Response.json({ id: 'email_mock' }) }
  if (target.startsWith('https://video.bunnycdn.com/library/123/videos')) {
    const guid = target.split('/').at(-1)!
    if (init?.method === 'POST') { const id = crypto.randomUUID(); const video = { guid: id, videoLibraryId: 123, status: 0, length: 0, storageSize: 0 }; videos.set(id, video); return Response.json(video) }
    if (init?.method === 'DELETE') { videos.delete(guid); return Response.json({ success: true }) }
    return Response.json(videos.get(guid))
  }
  throw new Error(`Unexpected network call in isolated course integration test: ${target.split('?')[0]}`)
}) as typeof fetch

database = await import('@/lib/db')
const { db, schema } = database
const tables = await import('@/lib/courses/schema')
const { courseSellers, courseOrders, courseEmails, courses, courseAssets } = tables
const catalog = await import('@/lib/courses/catalog'), commerce = await import('@/lib/courses/commerce'), access = await import('@/lib/courses/access'), media = await import('@/lib/courses/media'), sellers = await import('@/lib/courses/sellers'), hooks = await import('@/lib/courses/webhooks'), identity = await import('@/lib/courses/identity')
const creator = crypto.randomUUID(), buyer = crypto.randomUUID(), outsider = crypto.randomUUID()
await db.insert(schema.users).values([{ id: creator, email: 'creator@example.com', emailVerified: new Date() }, { id: buyer, email: 'buyer@example.com', emailVerified: new Date() }, { id: outsider, email: 'outsider@example.com' }])
const seller = await sellers.saveSeller(creator, { slug: 'big-creator', country: 'US', supportEmail: 'creator@example.com' })
await db.update(courseSellers).set({ status: 'enabled', stripeAccountId: 'acct_course_seller', stripeConnected: true, stripeLivemode: false, chargesEnabled: true, payoutsEnabled: true, stripeSyncedAt: new Date() }).where(eq(courseSellers.id, seller.id))
const lessonId = crypto.randomUUID(), sectionId = crypto.randomUUID()
const content = { title: 'Practical style', summary: 'A practical course', description: 'Learn practical skills', refundPolicy: 'Contact creator for refunds', price: { amount: 5000, currency: 'usd', accessDays: 365 }, sections: [{ id: sectionId, title: 'Introduction', lessons: [{ id: lessonId, title: 'Private lesson', kind: 'text', body: 'Paid content stays private' }] }] }
const course = await catalog.createCourse(creator, { slug: 'practical-style', content })
await assert.rejects(catalog.ownedCourse(buyer, course.id))
await assert.rejects(access.getLesson(null, course.id, lessonId, true))
await catalog.submitCourse(creator, course.id, 1)
await catalog.reviewCourse(course.id, 1, 'approve', '', creator)
const publicRow = await catalog.publicCourse('big-creator', 'practical-style')
assert.ok(!JSON.stringify(publicRow).includes('Paid content stays private'))
await assert.rejects(access.getLesson(null, course.id, lessonId), /Purchase/)
console.log('PASS: course ownership and public/private curriculum boundaries')

const draft = await catalog.saveCourse(creator, course.id, { version: 1, content: { ...content, title: 'Unpublished new title' } })
await assert.rejects(catalog.saveCourse(creator, course.id, { version: 1, content }))
assert.equal((await catalog.publicCourse('big-creator', 'practical-style')).content.title, 'Practical style')
await assert.rejects(catalog.reviewCourse(course.id, 1, 'approve', '', creator))
console.log('PASS: optimistic edit versions and immutable published content')
const customer = { id: buyer, email: 'buyer@example.com', emailVerified: new Date() }
await assert.rejects(commerce.checkout({ ...customer, emailVerified: null }, course.id))
const [first, duplicate] = await Promise.all([commerce.checkout(customer, course.id), commerce.checkout(customer, course.id)])
assert.ok('orderId' in first && 'orderId' in duplicate); assert.equal(first.orderId, duplicate.orderId); assert.equal(checkoutCreates, 1)
await assert.rejects(access.getLesson(buyer, course.id, lessonId), /Purchase/)
console.log('PASS: concurrent checkout creates one order and one account-scoped payment')
function pay(orderId: string, created = Math.floor(Date.now() / 1000)) {
  const session = [...sessions.values()].find(value => value.client_reference_id === orderId)!
  session.status = 'complete'; session.payment_status = 'paid'; session.payment_intent = `pi_${session.id}`
  const chargeId = `ch_${session.id}`
  intents.set(session.payment_intent, { status: 'succeeded', metadata: session.metadata, latest_charge: chargeId })
  charges.set(chargeId, { id: chargeId, amount: session.amount_total, amount_refunded: 0, currency: session.currency, livemode: false, paid: true, status: 'succeeded', created, balance_transaction: { fee: 180, currency: 'usd' } })
  return session
}
const paidSession = pay(first.orderId!)
await commerce.syncOrder(first.orderId!)
const originalEnrollment = await access.enrollment(buyer, course.id)
assert.ok(originalEnrollment); assert.equal((await access.getLesson(buyer, course.id, lessonId)).body, 'Paid content stays private')
expandedReads = true
const readsBeforeExpansion = paymentReads
await commerce.syncOrder(first.orderId!)
assert.equal(paymentReads, readsBeforeExpansion)
assert.equal((await access.enrollment(buyer, course.id))!.expiresAt.getTime(), originalEnrollment.expiresAt.getTime())
assert.equal((await db.select().from(courseEmails)).length, 1)
const paidOrder = await db.query.courseOrders.findFirst({ where: eq(courseOrders.id, first.orderId!) })
assert.equal(paidOrder!.totalAmount, 5500); assert.equal(paidOrder!.processingFee, 180)
await access.saveProgress(buyer, course.id, lessonId, { positionSeconds: 50, completed: true })
console.log('PASS: verified paid access, fixed expiry, tax/fee separation and durable progress')
const event = { id: 'evt_repeated', account: 'acct_course_seller', livemode: false, type: 'checkout.session.completed', data: { object: { ...paidSession, object: 'checkout.session' } } } as any
await hooks.connectEvent(event); await hooks.connectEvent(event)
assert.equal((await db.select().from(schema.billingWebhookReceipts)).length, 1)
await hooks.connectEvent({ ...event, id: 'evt_other_account', account: 'acct_unknown' })
console.log('PASS: durable webhook deduplication and account isolation')

const refundKey = crypto.randomUUID()
loseRefundResponse = true
await assert.rejects(commerce.refundOrder(seller.id, first.orderId!, refundKey, 1000))
const reporting = await import('@/lib/courses/reporting')
assert.equal((await reporting.creatorDashboard(seller.id, {})).orders.find(order => order.id === first.orderId)!.pendingRefundKey, refundKey)
await commerce.refundOrder(seller.id, first.orderId!, refundKey, 1000)
assert.equal((await reporting.creatorDashboard(seller.id, {})).orders.find(order => order.id === first.orderId)!.pendingRefundKey, null)
await commerce.refundOrder(seller.id, first.orderId!, refundKey, 1000)
assert.equal(refundCreates, 1); assert.ok(await access.enrollment(buyer, course.id))
await db.update(tables.courseRefunds).set({ createdAt: new Date(Date.now() - 25 * 3600_000) }).where(eq(tables.courseRefunds.requestKey, refundKey))
await commerce.refundOrder(seller.id, first.orderId!, refundKey, 1000)
assert.equal(refundCreates, 1)
await assert.rejects(commerce.refundOrder(seller.id, first.orderId!, refundKey, 1200))
await commerce.refundOrder(seller.id, first.orderId!, crypto.randomUUID())
assert.equal(await access.enrollment(buyer, course.id), undefined)
await assert.rejects(access.getLesson(buyer, course.id, lessonId))
await commerce.syncOrder(first.orderId!)
assert.equal(await access.enrollment(buyer, course.id), undefined)
console.log('PASS: partial/full refund behavior, retry safety and no access resurrection')

const replacement = await commerce.checkout(customer, course.id); assert.ok('orderId' in replacement)
const replacementSession = pay(replacement.orderId!, Math.floor(Date.now() / 1000) + 2)
await commerce.syncOrder(replacement.orderId!)
await commerce.syncOrder(first.orderId!)
assert.equal((await access.enrollment(buyer, course.id))!.orderId, replacement.orderId)
const replacementCharge = intents.get(replacementSession.payment_intent!).latest_charge
disputes.set(replacementCharge, [{ status: 'needs_response' }]); await commerce.syncOrder(replacement.orderId!)
assert.equal(await access.enrollment(buyer, course.id), undefined)
const newest = await commerce.checkout(customer, course.id); assert.ok('orderId' in newest)
pay(newest.orderId!, charges.get(replacementCharge).created)
await commerce.syncOrder(newest.orderId!)
disputes.set(replacementCharge, [{ status: 'won' }]); await commerce.syncOrder(replacement.orderId!)
assert.equal((await access.enrollment(buyer, course.id))!.orderId, newest.orderId)
console.log('PASS: old refunded orders cannot revoke new purchases; dispute resolution restores access')

const assetUpload = await media.startUpload(creator, course.id, { kind: 'video', title: 'Lesson video', contentType: 'video/mp4', sizeBytes: 10000, durationSeconds: 120 })
assert.equal(assetUpload.protocol, 'tus'); assert.ok(!JSON.stringify(assetUpload).includes('course_mock'))
const asset = await db.query.courseAssets.findFirst({ where: eq(courseAssets.id, assetUpload.assetId) })
const reservedCount = (await db.select().from(courseAssets)).length
const retryInput = { kind: 'video', title: 'Lesson video', contentType: 'video/mp4', sizeBytes: 10000, durationSeconds: 120 }
assert.equal((await media.resumeUpload(creator, course.id, asset!.id, retryInput)).assetId, asset!.id)
assert.equal((await db.select().from(courseAssets)).length, reservedCount)
await assert.rejects(media.resumeUpload(outsider, course.id, asset!.id, retryInput))
await assert.rejects(media.resumeUpload(creator, course.id, asset!.id, { ...retryInput, sizeBytes: 10001 }))
console.log('PASS: interrupted upload resumes the existing reservation; ownership and original file identity are enforced')
const video = videos.get(asset!.bunnyVideoId!)!; video.status = 3; video.length = 119; video.storageSize = 20000
assert.equal((await media.finishUpload(creator, course.id, asset!.id))!.state, 'processing')
video.status = 4; video.length = 119.5
assert.equal((await media.finishUpload(creator, course.id, asset!.id))!.state, 'ready')
await assert.rejects(media.resumeUpload(creator, course.id, asset!.id, retryInput))
assert.equal((await db.query.courseAssets.findFirst({ where: eq(courseAssets.id, asset!.id) }))!.durationSeconds, 119.5)
const nextContent = { ...content, sections: [{ id: sectionId, title: 'Introduction', lessons: [{ id: lessonId, title: 'Video lesson', kind: 'video', videoAssetId: asset!.id }] }] }
const videoDraft = await catalog.saveCourse(creator, course.id, { version: draft.version, content: nextContent })
await assert.rejects(media.deleteAsset(creator, course.id, asset!.id))
await catalog.submitCourse(creator, course.id, videoDraft.version)
await catalog.reviewCourse(course.id, videoDraft.version, 'approve', '', creator)
await assert.rejects(access.assetAccess(outsider, course.id, lessonId, asset!.id))
assert.ok((await access.assetAccess(buyer, course.id, lessonId, asset!.id)).url.includes('token='))
assert.equal((await access.saveProgress(buyer, course.id, lessonId, { positionSeconds: 119, completed: true })).completed, false, 'A playhead or client completion flag is not watched coverage')
await assert.rejects(access.saveProgress(buyer, course.id, lessonId, { positionSeconds: 10, completed: false, watchedRanges: [[30, 10]] }))
await Promise.all([
  access.saveProgress(buyer, course.id, lessonId, { positionSeconds: 60, completed: false, watchedRanges: [[0, 60]] }),
  access.saveProgress(buyer, course.id, lessonId, { positionSeconds: 114, completed: false, watchedRanges: [[60, 114]] }),
])
const watched = await db.query.courseProgress.findFirst({ where: eq(tables.courseProgress.lessonId, lessonId) })
assert.equal(watched!.completed, true); assert.deepEqual(watched!.watchedRanges, [[0, 114]])
assert.equal((await access.saveProgress(buyer, course.id, lessonId, { positionSeconds: 0, completed: false })).completed, true)
console.log('PASS: fractional video duration, server-derived 95% completion and concurrent durable watch coverage')
await catalog.archiveCourse(creator, course.id, videoDraft.version)
await assert.rejects(commerce.checkout({ id: outsider, email: 'outsider@example.com', emailVerified: new Date() }, course.id))
assert.ok(await access.getLesson(buyer, course.id, lessonId))
assert.equal((await catalog.courseOverview(course.id, buyer)).id, course.id)
await assert.rejects(catalog.courseOverview(course.id, outsider))
await db.update(courses).set({ contentBlocked: true }).where(eq(courses.id, course.id))
await assert.rejects(access.getLesson(buyer, course.id, lessonId))
await assert.rejects(catalog.courseOverview(course.id, buyer))
console.log('PASS: verified video uploads, reference-safe deletion, signed playback, archive access and takedowns')

const second = await catalog.createCourse(creator, { slug: 'second-course', content })
await catalog.submitCourse(creator, second.id, 1); await catalog.reviewCourse(second.id, 1, 'approve', '', creator)
loseCheckoutResponse = true
await assert.rejects(commerce.checkout(customer, second.id))
const beforeRecovery = checkoutCreates
const recovered = await commerce.checkout(customer, second.id)
assert.equal(checkoutCreates, beforeRecovery); assert.ok('url' in recovered)
console.log('PASS: lost Checkout response recovers the same provider purchase')

await identity.sendVerification({ id: outsider, email: 'outsider@x.local', emailVerified: null }, { email: 'student@example.com' })
await identity.verifyEmail({ id: outsider, email: 'outsider@x.local' }, { token: verificationCode })
assert.equal((await identity.buyerIdentity({ id: outsider, email: 'outsider@x.local', emailVerified: null })).email, 'student@example.com')
await assert.rejects(identity.verifyEmail({ id: outsider, email: 'outsider@x.local' }, { token: verificationCode }))
assert.equal(outboundEmails, 1)
const raw = Buffer.from('{"VideoLibraryId":123,"Status":3}')
const { createHmac } = await import('node:crypto')
const signature = createHmac('sha256', 'secret').update(raw).digest('hex')
assert.ok(hooks.verifyBunnySignature(raw, signature, 'v1', 'hmac-sha256', 'secret'))
assert.ok(!hooks.verifyBunnySignature(Buffer.from('{}'), signature, 'v1', 'hmac-sha256', 'secret'))
assert.ok(!hooks.verifyBunnySignature(raw, signature, 'v2', 'hmac-sha256', 'secret'))
console.log('PASS: email delivery integration and raw-body video signature verification')

const route = (await import('@/pages/api/courses/[[...path]]')).default
async function request(path: string[], method: string, userId: string | null, origin = 'http://localhost:3000') {
  requestUserId = userId
  let status = 200, body: any
  const req = { method, query: { path }, headers: { origin }, body: {} } as any
  const res = { setHeader: () => {}, status: (value: number) => { status = value; return res }, json: (value: unknown) => { body = value; return res } } as any
  await route(req, res); return { status, body }
}
assert.equal((await request([], 'GET', null)).status, 200)
assert.equal((await request(['library'], 'GET', null)).status, 401)
assert.equal((await request([second.id, 'checkout'], 'POST', buyer, 'https://attacker.example')).status, 403)
assert.equal((await request(['orders', first.orderId!], 'GET', outsider)).status, 404)
console.log('PASS: HTTP authentication, cross-site write rejection and order ownership')
const connectHandler = (await import('../../pages/api/payments/stripe-connect-webhook')).default
const eventBody = JSON.stringify({ id: 'evt_signature_test', type: 'account.updated', account: 'acct_unknown', livemode: false, data: { object: {} } })
const eventSignature = await provider.webhooks.generateTestHeaderStringAsync({ payload: eventBody, secret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET! })
const webhookRequest = async (body: string, signature: string) => {
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', headers: { 'stripe-signature': signature } })
  let status = 0
  const res = { setHeader() {}, status(code: number) { status = code; return this }, json() { return this } }
  await connectHandler(req as any, res as any)
  return status
}
assert.equal(await webhookRequest(eventBody, eventSignature), 200)
assert.equal(await webhookRequest(eventBody, eventSignature), 200)
assert.equal(await webhookRequest(eventBody.replace('acct_unknown', 'acct_tampered'), eventSignature), 400)
assert.equal(await webhookRequest(eventBody, 'invalid'), 400)
console.log('PASS: real Stripe SDK asynchronous webhook signature verification, duplicate delivery and tamper rejection under Bun')
const freeCourses = []
for (const title of ['Pagination first', 'Pagination second']) {
  const record = await catalog.createCourse(creator, { slug: title.toLowerCase().replaceAll(' ', '-'), content: { ...content, title, price: { ...content.price, amount: 0 } } })
  await catalog.submitCourse(creator, record.id, 1)
  await catalog.reviewCourse(record.id, 1, 'approve', '', creator)
  await commerce.checkout(customer, record.id)
  freeCourses.push(record)
}
const catalogFirst = await catalog.catalog({ limit: 1, q: 'pagination' })
const catalogNext = await catalog.catalog({ limit: 1, page: 2, q: 'pagination' })
assert.equal(catalogFirst.hasMore, true); assert.equal(catalogNext.hasMore, false)
assert.notEqual(catalogFirst.items[0].id, catalogNext.items[0].id)
assert.equal((await catalog.catalog({ q: 'PAGINATION SECOND' })).items[0].id, freeCourses[1].id)
assert.equal((await catalog.catalog({ q: 'pagination', category: 'dating' })).items.length, 0)
const libraryFirst = await access.library(buyer, { limit: 1 }), libraryNext = await access.library(buyer, { limit: 1, page: 2 })
assert.equal(libraryFirst.hasMore, true); assert.notEqual(libraryFirst.items[0].id, libraryNext.items[0].id)
assert.equal((await reporting.courseStudents(seller.id, freeCourses[0].id, {})).students.length, 1)
await assert.rejects(reporting.courseStudents(crypto.randomUUID(), freeCourses[0].id, {}))
console.log('PASS: complete catalog search/category filtering, stable catalog/library pagination and private creator student lists')
const reservations = await db.select().from(courseAssets)
await assert.rejects(media.startUpload(creator, second.id, { kind: 'resource', title: 'File', contentType: 'text/plain', sizeBytes: 20 }))
assert.equal((await db.select().from(courseAssets)).length, reservations.length, 'Missing storage configuration must not reserve quota')
const pendingEmails = await db.select().from(courseEmails)
const beforeEmails = outboundEmails
delete process.env.RESEND_API_KEY
const maintenance = await import('@/lib/courses/maintenance')
const deferred = await maintenance.maintainCourses()
assert.equal(deferred.emailDeferred, true); assert.equal(deferred.emails, 0); assert.equal(outboundEmails, beforeEmails)
assert.deepEqual(await db.select().from(courseEmails), pendingEmails, 'Deferred email must remain queued without failed attempts')
process.env.RESEND_API_KEY = 'course_mock'
console.log('PASS: missing R2 fails before reserving quota; maintenance defers unconfigured email without consuming retries')

const onboardingSeller = await sellers.saveSeller(outsider, { slug: 'onboarding-check', country: 'US', supportEmail: 'outsider@example.com' })
const onboardingLink = await sellers.onboarding(outsider, 'outsider@example.com')
assert.ok(onboardingLink.url.startsWith('https://connect.stripe.com/'))
assert.ok(new Date(onboardingLink.expiresAt).getTime() > Date.now())
await sellers.onboarding(outsider, 'outsider@example.com')
assert.equal(accountCreates, 1, 'Renewing an onboarding link must not create another account')
let connectedSeller = await sellers.sellerForUser(outsider)
assert.equal(connectedSeller.stripeAccountId, 'acct_course_onboarding'); assert.equal(connectedSeller.stripeLivemode, false)
const account = stripeAccounts.get('acct_course_onboarding')
assert.deepEqual(linkedConfigurations, ['merchant'])
account.applied_configurations = ['merchant', 'recipient']
await sellers.onboarding(outsider, 'outsider@example.com')
assert.deepEqual(linkedConfigurations, ['merchant', 'recipient'], 'Legacy account links must include the existing recipient configuration')
assert.equal(accountCreates, 1, 'Legacy onboarding must preserve the connected account')
account.configuration.merchant.capabilities.stripe_balance.payouts.status = 'restricted'
account.requirements.entries = [{ awaiting_action_from: 'user', description: 'Payout account' }, { awaiting_action_from: 'stripe', description: 'Verification pending' }]
connectedSeller = await sellers.syncSeller(connectedSeller)
assert.equal(connectedSeller.chargesEnabled, true); assert.equal(connectedSeller.payoutsEnabled, false)
assert.deepEqual(connectedSeller.requirements, ['Payout account'])
account.configuration.merchant.capabilities.card_payments.status = 'restricted'
connectedSeller = await sellers.syncSeller(connectedSeller)
assert.equal(connectedSeller.chargesEnabled, false)
account.defaults.responsibilities.losses_collector = 'application'
assert.equal(sellers.accountEligible(account), false)
account.defaults.responsibilities.losses_collector = 'stripe'
account.livemode = true
await assert.rejects(sellers.syncSeller(connectedSeller), /environment does not match/)
account.livemode = false
console.log('PASS: Accounts v2 merchant-only onboarding, stable account identity, exact API version, capability gating, requirements and environment isolation')

const accountHandler = (await import('../../pages/api/payments/stripe-connect-account-webhook')).default
const accountNotification = { id: 'evt_v2_capability', object: 'v2.core.event', type: 'v2.core.account[configuration.merchant].capability_status_updated', livemode: false, created: new Date().toISOString(), related_object: { id: 'acct_course_onboarding', type: 'v2.core.account', url: '/v2/core/accounts/acct_course_onboarding' } }
const accountBody = JSON.stringify(accountNotification)
const accountSignature = await provider.webhooks.generateTestHeaderStringAsync({ payload: accountBody, secret: process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET! })
const accountWebhookRequest = async (body: string, signature: string) => {
  const req = Object.assign(Readable.from([Buffer.from(body)]), { method: 'POST', headers: { 'stripe-signature': signature } })
  let status = 0
  const res = { setHeader() {}, status(code: number) { status = code; return this }, json() { return this } }
  await accountHandler(req as any, res as any)
  return status
}
account.configuration.merchant.capabilities.card_payments.status = 'active'
account.configuration.merchant.capabilities.stripe_balance.payouts.status = 'active'
account.requirements.entries = []
const readsBefore = accountReads
assert.equal(await accountWebhookRequest(accountBody, accountSignature), 200)
assert.equal(await accountWebhookRequest(accountBody, accountSignature), 200)
assert.equal(accountReads, readsBefore + 1, 'Thin-event replay must not fetch or process the account twice')
assert.equal((await sellers.sellerForUser(outsider)).payoutsEnabled, true)
assert.equal(await accountWebhookRequest(accountBody.replace('acct_course_onboarding', 'acct_tampered'), accountSignature), 400)
assert.equal(await accountWebhookRequest(accountBody, eventSignature), 400, 'Snapshot destination secret must not validate thin events')
const wrongMode = await stripeSdk.parseEventNotificationAsync(JSON.stringify({ ...accountNotification, id: 'evt_v2_wrong_mode', livemode: true }), await provider.webhooks.generateTestHeaderStringAsync({ payload: JSON.stringify({ ...accountNotification, id: 'evt_v2_wrong_mode', livemode: true }), secret: process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET! }), process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET!)
await hooks.connectAccountEvent(wrongMode)
assert.equal(accountReads, readsBefore + 1)
const closedBody = JSON.stringify({ ...accountNotification, id: 'evt_v2_closed', type: 'v2.core.account.closed' })
assert.equal(await accountWebhookRequest(closedBody, await provider.webhooks.generateTestHeaderStringAsync({ payload: closedBody, secret: process.env.STRIPE_CONNECT_ACCOUNT_WEBHOOK_SECRET! })), 200)
const closedSeller = await sellers.sellerForUser(outsider)
assert.equal(closedSeller.stripeConnected, false); assert.equal(closedSeller.chargesEnabled, false); assert.equal(closedSeller.payoutsEnabled, false)
assert.equal(closedSeller.id, onboardingSeller.id)
console.log('PASS: signed thin-event processing, distinct secrets, duplicate/tamper rejection, wrong-mode isolation and account closure')

const oauthUser = crypto.randomUUID()
await db.insert(schema.users).values({ id: oauthUser, email: 'oauth@example.com', emailVerified: new Date() })
await sellers.saveSeller(oauthUser, { slug: 'existing-account-check', country: 'US', supportEmail: 'oauth@example.com' })
stripeAccounts.set('acct_course_oauth', accountState('acct_course_oauth', 'DE'))
const oauthQuery = async () => ({ state: new URL((await identity.oauthStart(oauthUser)).url).searchParams.get('state'), code: 'test-authorization-code' })
await assert.rejects(identity.oauthComplete(oauthUser, await oauthQuery()), /selected country/)
stripeAccounts.set('acct_course_oauth', accountState('acct_course_oauth'))
const query = await oauthQuery()
const oauthSeller = await identity.oauthComplete(oauthUser, query)
assert.equal(oauthSeller.stripeAccountId, 'acct_course_oauth'); assert.equal(oauthSeller.chargesEnabled, true); assert.equal(oauthSeller.payoutsEnabled, true)
await assert.rejects(identity.oauthComplete(oauthUser, query), /invalid or expired/)
console.log('PASS: existing-account OAuth retains v1 authentication, v2 capability refresh, country checks and single-use authorization state')
globalThis.fetch = realFetch
await (globalThis as any).postgresClient?.end()
console.log('All course backend integration checks passed. Providers were mocked; no live credentials were used.')
