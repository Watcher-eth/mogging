import assert from 'node:assert/strict'
import type { NextApiRequest, NextApiResponse } from 'next'
import upgradesHandler from '@/pages/api/payments/upgrades'
import { sql, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { creditRevenueCatScans, consumeEvaluationEntitlement, getEntitlementSummary, syncRevenueCatScans } from '@/lib/payments/entitlements'
import { scanProducts, type RevenueCatSubscriber } from '@/lib/payments/revenuecat'

// This test creates a minimal schema and must only run in a disposable local database.
const url = new URL(process.env.DATABASE_URL!)
assert.ok(['localhost', '127.0.0.1'].includes(url.hostname) && process.env.SCAN_CREDIT_TEST === '1', 'Use a disposable local DB with SCAN_CREDIT_TEST=1')
await db.execute(sql`CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY)`)
await db.execute(sql`CREATE TABLE IF NOT EXISTS payment_entitlements (
 id text PRIMARY KEY, mobile_install_id text NOT NULL, user_id text REFERENCES users(id),
 anonymous_actor_id text, stripe_checkout_session_id text UNIQUE NOT NULL,
 stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent_id text,
 product text NOT NULL, credit_balance integer NOT NULL DEFAULT 0,
 subscription_status text, current_period_end timestamp, activation_code_hash text,
 activation_code_last4 text, activation_code_redeemed_at timestamp, source text,
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
)`)
const account = crypto.randomUUID()
const otherAccount = crypto.randomUUID()
await db.execute(sql`INSERT INTO users (id) VALUES (${account}), (${otherAccount})`)
await db.execute(sql`CREATE TABLE IF NOT EXISTS sessions (session_token text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires timestamp NOT NULL)`)
const token = crypto.randomUUID()
await db.execute(sql`INSERT INTO sessions (session_token, user_id, expires) VALUES (${token}, ${account}, now() + interval '1 day')`)
async function request(method: string, body: unknown = {}) {
  let status = 200
  let result: any
  const response = {
    setHeader() {},
    status(code: number) { status = code; return this },
    json(value: unknown) { result = value; return this },
  } as unknown as NextApiResponse
  await upgradesHandler({ method, headers: { authorization: `Bearer ${token}` }, body } as NextApiRequest, response)
  return { status, result }
}
const single = scanProducts[0].productId
const pack = scanProducts[1].productId
const subscriber: RevenueCatSubscriber = {
  entitlements: {},
  non_subscriptions: {
    [single]: [{ id: `single-${account}`, store_transaction_id: `apple-single-${account}` }],
    [pack]: [{ id: `pack-${account}`, store_transaction_id: `apple-pack-${account}` }],
    unknown_product: [{ id: 'must-not-credit' }],
  },
}
const originalFetch = globalThis.fetch
let verificationAvailable = true
globalThis.fetch = (async (input: RequestInfo | URL) => {
  assert.ok(String(input).startsWith('https://api.revenuecat.com/v1/subscribers/'))
  if (!verificationAvailable) return new Response('{}', { status: 503 })
  return Response.json({ subscriber: String(input).endsWith(account) ? subscriber : { entitlements: {}, non_subscriptions: {} } })
}) as typeof fetch
try {
  await Promise.all(Array.from({ length: 6 }, () => syncRevenueCatScans(account)))
  const summary = () => getEntitlementSummary({ userId: account })
  assert.equal((await summary()).evaluationCredits, 4, 'duplicate purchase delivery grants only once')
  const catalog = await request('GET')
  assert.equal(catalog.status, 200)
  assert.equal(catalog.result.data.products.length, 2)
  const verified = await request('POST', { mobileInstallId: 'test_install', transactionId: `apple-single-${account}` })
  assert.equal(verified.status, 200)
  assert.equal(verified.result.data.entitlements.evaluationCredits, 4)
  const forged = await request('POST', { mobileInstallId: 'test_install', transactionId: 'invented', evaluationCredits: 999, userId: otherAccount })
  assert.equal(forged.status, 409, 'client cannot invent a purchase or choose the credited account')
  await consumeEvaluationEntitlement({ userId: account })
  assert.equal((await summary()).evaluationCredits, 3, 'one scan spends exactly one credit across multiple packs')
  await syncRevenueCatScans(account)
  assert.equal((await summary()).evaluationCredits, 3, 'restoring does not refill spent credits')
  await creditRevenueCatScans(otherAccount, undefined, subscriber)
  assert.equal((await getEntitlementSummary({ userId: otherAccount })).evaluationCredits, 0, 'aliased purchase cannot be granted to two accounts')

  await db.insert(schema.paymentEntitlements).values({
    userId: account, mobileInstallId: 'test_install', stripeCheckoutSessionId: `extra-${account}`,
    product: 'extra_potential_image', creditBalance: 1, metadata: { extras: { potentialImages: 1 } },
  })
  const concurrent = await Promise.allSettled(Array.from({ length: 5 }, () => consumeEvaluationEntitlement({ userId: account })))
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 3)
  assert.equal((await summary()).evaluationCredits, 0)
  assert.equal((await summary()).extras.potentialImages, 1, 'scans never spend potential-image credits')
  const rows = await db.query.paymentEntitlements.findMany({ where: eq(schema.paymentEntitlements.userId, account) })
  assert.ok(rows.every((row) => row.creditBalance >= 0), 'concurrent spending never creates a negative balance')

  subscriber.non_subscriptions![pack].push({ id: `second-pack-${account}` })
  await syncRevenueCatScans(account)
  assert.equal((await summary()).evaluationCredits, 3, 'a new purchase credits a second pack')
  subscriber.non_subscriptions![pack][1].refunded_at = new Date().toISOString()
  await syncRevenueCatScans(account)
  assert.equal((await summary()).evaluationCredits, 0, 'refund removes remaining credits')
  subscriber.non_subscriptions![pack][1].refunded_at = null
  await syncRevenueCatScans(account)
  assert.equal((await summary()).evaluationCredits, 0, 'stale verification cannot regrant a refunded purchase')

  subscriber.entitlements = { pro: { expires_date: new Date(Date.now() + 86_400_000).toISOString() } }
  assert.equal((await summary()).subscription.active, true, 'subscription is verified on the server')
  await consumeEvaluationEntitlement({ userId: account })
  assert.equal((await summary()).evaluationCredits, 0, 'Pro access does not require purchased credits')
  verificationAvailable = false
  await assert.rejects(() => syncRevenueCatScans(account), /could not be verified/)
  console.log('PASS: verified purchases, retry/restore idempotency, account isolation, one-credit consumption, concurrent exhaustion, extras isolation, repeat purchases, refunds, verification failure.')
} finally {
  globalThis.fetch = originalFetch
  await db.execute(sql`DELETE FROM payment_entitlements WHERE user_id IN (${account}, ${otherAccount})`)
  await db.execute(sql`DELETE FROM sessions WHERE session_token = ${token}`)
  await db.execute(sql`DELETE FROM users WHERE id IN (${account}, ${otherAccount})`)
}
process.exit(0)
