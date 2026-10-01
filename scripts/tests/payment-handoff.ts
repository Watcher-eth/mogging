// Isolated integration test. Explicit localhost-only URL prevents touching live data.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'

const url = process.env.PAYMENT_TEST_DATABASE_URL
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Set PAYMENT_TEST_DATABASE_URL to an isolated local PostgreSQL server')
const admin = postgres(url, { max: 1 })
const namespace = `payment_test_${randomUUID().replaceAll('-', '')}`
await admin.unsafe(`CREATE SCHEMA "${namespace}"`)
const scoped = new URL(url)
scoped.searchParams.set('options', `-c search_path=${namespace} -c timezone=UTC`)
process.env.DATABASE_URL = scoped.toString()
process.env.NEXTAUTH_SECRET = 'isolated-payment-test-secret-at-least-32-characters'
process.env.REVENUECAT_SECRET_API_KEY = 'isolated-provider-fixture'
process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fixture'
const sql = postgres(scoped.toString(), { max: 1 })
process.env.UPSTASH_REDIS_REST_URL = ''
process.env.UPSTASH_REDIS_REST_TOKEN = ''
const realFetch = globalThis.fetch
try {
  await sql.unsafe(`CREATE TABLE users (id text PRIMARY KEY);
    CREATE TABLE payment_entitlements (
      id text PRIMARY KEY, mobile_install_id text NOT NULL, user_id text,
      anonymous_actor_id text, stripe_checkout_session_id text NOT NULL UNIQUE,
      stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent_id text,
      product text NOT NULL, credit_balance integer NOT NULL DEFAULT 0, subscription_status text,
      current_period_end timestamp, activation_code_hash text, activation_code_last4 text,
      activation_code_redeemed_at timestamp, source text, metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now(),
      CONSTRAINT payment_entitlements_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE sessions (session_token text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires timestamp NOT NULL);
    CREATE TABLE photos (id text PRIMARY KEY, user_id text REFERENCES users(id) ON DELETE CASCADE);
    CREATE TABLE analyses (
      id text PRIMARY KEY, photo_id text NOT NULL UNIQUE REFERENCES photos(id) ON DELETE CASCADE, status text NOT NULL,
      psl_score real, harmony_score real, dimorphism_score real, angularity_score real, percentile real,
      tier text, tier_description text, metrics jsonb NOT NULL DEFAULT '{}', landmarks jsonb NOT NULL DEFAULT '{}',
      model text, prompt_version text, failure_reason text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    );`)
  await sql.unsafe(await readFile(new URL('../../drizzle/0031_scan_allowances.sql', import.meta.url), 'utf8'))
  await sql.unsafe(`CREATE TABLE payment_handoffs (
    id text PRIMARY KEY, token_hash text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES users(id),
    stripe_checkout_session_id text NOT NULL UNIQUE, expires_at timestamp NOT NULL,
    consumed_at timestamp, consumed_by_install_id text, created_at timestamp NOT NULL DEFAULT now()
  );
  CREATE TABLE analytics_events (
    id text PRIMARY KEY, event_id text NOT NULL UNIQUE, event_name text NOT NULL, schema_version integer DEFAULT 1,
    environment text DEFAULT 'test', app_version text, exported_at timestamp, account_id text REFERENCES users(id),
    mobile_install_id text, anonymous_id text, session_id text, platform text NOT NULL, source text,
    properties jsonb DEFAULT '{}', occurred_at timestamp NOT NULL, received_at timestamp DEFAULT now()
  );`)
  const { createPaymentHandoff, consumePaymentHandoff } = await import('../../lib/payments/handoff')
  const { grantEntitlementFromCheckoutSession, getEntitlementSummary, redeemPaymentActivationCode, reserveEvaluation, finishEvaluation, revokePaymentIntentEntitlements } = await import('../../lib/payments/entitlements')
  const { getStripe } = await import('../../lib/payments/stripe')
  const { getRequestUserId } = await import('../../lib/auth/mobile-session')
  const { default: consumeHandler } = await import('../../pages/api/payments/handoff/consume')
  const checkouts = new Map<string, any>()
  const subscriptions = new Map<string, any>()
  let stripeAvailable = true
  getStripe().checkout.sessions.retrieve = (async (id: string) => {
    if (!stripeAvailable) throw new Error('simulated Stripe outage')
    const session = checkouts.get(id)
    assert.ok(session, 'all Stripe sessions must be isolated fixtures')
    return session
  }) as any
  getStripe().subscriptions.retrieve = (async (id: string) => {
    if (!stripeAvailable) throw new Error('simulated Stripe outage')
    assert.ok(subscriptions.has(id))
    return subscriptions.get(id)
  }) as any
  // No real provider requests, charges, messages, or customer data.
  globalThis.fetch = (async () => { throw new Error('simulated RevenueCat outage') }) as typeof fetch
  await sql`INSERT INTO users (id) VALUES ('buyer'), ('other')`
  const now = Math.floor(Date.now() / 1000)
  const fixture = (id: string, product = 'evaluation_pack_3', subscription: any = null) => ({
    id, created: now, mode: subscription ? 'subscription' : 'payment', status: 'complete', payment_status: 'paid',
    client_reference_id: 'buyer', customer: null, payment_intent: null, subscription,
    metadata: { product, accountId: 'buyer', userId: 'buyer', activationCode: '867530', mobileInstallId: 'web-install', source: 'payment_test' },
  })
  const session = fixture('cs_test_paid')
  checkouts.set(session.id, session)
  const owner = { userId: 'buyer', mobileInstallId: 'ios-install' }
  const create = (sessionId = session.id, accountId = 'buyer') => createPaymentHandoff({ sessionId, accountId })
  const consume = (token: string, mobileInstallId = owner.mobileInstallId) => consumePaymentHandoff({ token, mobileInstallId })
  // Redirect reaches us before the webhook; verify Stripe and grant exactly once.
  const links = await Promise.all(Array.from({ length: 5 }, () => create()))
  assert.equal(new Set(links.map(link => link.token)).size, 1, 'concurrent creation returns one usable token')
  assert.equal((await getEntitlementSummary(owner)).evaluationCredits, 3)
  await Promise.all(Array.from({ length: 5 }, () => grantEntitlementFromCheckoutSession({ session })))
  assert.equal((await getEntitlementSummary(owner)).evaluationCredits, 3, 'late/duplicate webhook cannot refill credits')
  await assert.rejects(create(session.id, 'other'), /account used at checkout/)
  assert.equal((await getEntitlementSummary({ userId: 'other', mobileInstallId: 'ios-install' })).evaluationCredits, 0, 'device ID cannot transfer ownership')
  const unpaid = { ...fixture('cs_test_unpaid'), payment_status: 'unpaid' }
  checkouts.set(unpaid.id, unpaid)
  await assert.rejects(create(unpaid.id), /still processing/)
  const forged = { ...fixture('cs_test_mismatch'), client_reference_id: 'other' }
  checkouts.set(forged.id, forged)
  await assert.rejects(create(forged.id), /account used at checkout/)

  const token = links[0].token
  const activations = await Promise.all(Array.from({ length: 5 }, () => consume(token)))
  assert.ok(activations.every(result => result.accountId === 'buyer' && result.entitlements.evaluationCredits === 3))
  await assert.rejects(consume(token, 'another-install'), /already used/)
  await assert.rejects(consume(`${token.slice(0, -5)}xxxxx`), /Invalid or expired/)
  const renewed = await create()
  assert.notEqual(renewed.token, token, 'authenticated owner can reopen a used receipt')
  await assert.rejects(consume(token), /invalid, expired, or already used/)
  assert.equal((await consume(renewed.token, 'another-install')).entitlements.evaluationCredits, 3, 'new device never grants extra credits')
  await sql`UPDATE payment_handoffs SET expires_at = now() - interval '1 minute' WHERE stripe_checkout_session_id = ${session.id}`
  const expiredReplacement = await create()
  assert.notEqual(expiredReplacement.token, renewed.token)
  assert.equal((await consume(expiredReplacement.token)).entitlements.evaluationCredits, 3)
  await redeemPaymentActivationCode({ code: '867530', ...owner, userId: 'buyer' })
  assert.equal((await redeemPaymentActivationCode({ code: '867530', ...owner, userId: 'buyer' })).evaluationCredits, 3, 'code retries do not double grant')
  await assert.rejects(redeemPaymentActivationCode({ code: '867530', ...owner, userId: 'other' }), /not found for this account/)

  // Lost response after server claim: retry the actual API and receive a usable session.
  const apiLink = await create()
  const callConsumeApi = async () => {
    let status = 0
    let payload: any
    const response = { setHeader() {}, status(code: number) { status = code; return this }, json(body: unknown) { payload = body; return this } }
    const request = { method: 'POST', headers: {}, socket: { remoteAddress: 'local-payment-test' }, body: { token: apiLink.token, mobileInstallId: owner.mobileInstallId } }
    await consumeHandler(request as any, response as any)
    assert.equal(status, 200)
    assert.equal(payload.data.session.userId, 'buyer')
    assert.equal(payload.data.entitlements.evaluationCredits, 3)
    assert.equal(await getRequestUserId({ headers: { authorization: `Bearer ${payload.data.session.token}` } } as any, response as any), 'buyer')
    return payload.data.session
  }
  const apiSession = await callConsumeApi()
  assert.notEqual((await callConsumeApi()).token, apiSession.token, 'repeat claim recovers a fresh login session')
  const reservation = await reserveEvaluation(owner, 'evaluation-after-web-purchase', 'photo-body')
  assert.equal(reservation.summary.evaluationCredits, 2, 'web purchase actually unlocks evaluation reservation')
  await finishEvaluation(reservation.id, { analysis: { status: 'complete' } }, true)
  assert.ok((await reserveEvaluation(owner, 'evaluation-after-web-purchase', 'photo-body')).result, 'evaluation retry reuses its result')
  assert.equal((await getEntitlementSummary(owner)).evaluationCredits, 2, 'evaluation retry does not spend twice')
  await grantEntitlementFromCheckoutSession({ session })
  assert.equal((await getEntitlementSummary(owner)).evaluationCredits, 2, 'webhook after spending never refills purchase')

  // A subscription provides the correct period allowance even without a webhook.
  const subscription = { id: 'sub_test_monthly', status: 'active', customer: null, items: { data: [{ current_period_start: now, current_period_end: now + 30 * 86400, price: { recurring: { interval: 'month' } } }] } }
  subscriptions.set(subscription.id, subscription)
  const monthly = fixture('cs_test_monthly', 'mobile_subscription_monthly', subscription)
  checkouts.set(monthly.id, monthly)
  const monthlyLink = await create(monthly.id)
  assert.equal((await consume(monthlyLink.token)).entitlements.evaluationCredits, 12, 'monthly plan grants ten scans plus remaining pack')
  stripeAvailable = false
  assert.equal((await getEntitlementSummary(owner)).evaluationCredits, 12, 'provider outage retains verified, unexpired access')
  assert.ok((await create(monthly.id)).token, 'already confirmed receipt works during Stripe outage')
  stripeAvailable = true
  subscription.status = 'canceled'
  assert.equal((await getEntitlementSummary(owner)).evaluationCredits, 2, 'cancellation cannot spend stale subscription allowances')
  await assert.rejects(create(monthly.id), /no longer provides active access/)
  await sql`UPDATE payment_entitlements SET stripe_payment_intent_id = 'pi_test_refund' WHERE stripe_checkout_session_id = ${session.id}`
  await revokePaymentIntentEntitlements({ paymentIntentId: 'pi_test_refund', status: 'refunded' })
  await assert.rejects(create(), /no longer provides active access/)
  const expired = fixture('cs_test_expired', 'evaluation')
  checkouts.set(expired.id, expired)
  await grantEntitlementFromCheckoutSession({ session: expired })
  await sql`UPDATE payment_entitlements SET credit_expires_at = now() - interval '1 minute' WHERE stripe_checkout_session_id = ${expired.id}`
  await assert.rejects(create(expired.id), /no longer provides active access/)
  console.log('PASS: delayed/duplicate webhooks, concurrency, ownership, unpaid/forged checkout, token tampering/replay/renewal, device recovery, code retries, usable mobile session, evaluation reservation/replay, billing periods, provider outages, cancellation, refunds, expiry')
} finally {
  globalThis.fetch = realFetch
  const client = (globalThis as typeof globalThis & { postgresClient?: postgres.Sql }).postgresClient
  if (client) await client.end()
  await sql.end()
  await admin.unsafe(`DROP SCHEMA "${namespace}" CASCADE`)
  await admin.end()
}
