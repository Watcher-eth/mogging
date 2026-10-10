// Isolated integration test. Explicit localhost-only URL prevents touching live data.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import postgres from 'postgres'
import { mock } from 'bun:test'

const url = process.env.SCAN_TEST_DATABASE_URL
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Set SCAN_TEST_DATABASE_URL to an isolated local PostgreSQL server')
const admin = postgres(url, { max: 1 })
const namespace = `scan_test_${randomUUID().replaceAll('-', '')}`
await admin.unsafe(`CREATE SCHEMA "${namespace}"`)
const scoped = new URL(url)
scoped.searchParams.set('options', `-c search_path=${namespace} -c timezone=UTC`)
process.env.DATABASE_URL = scoped.toString()
process.env.NEXTAUTH_SECRET = 'isolated-scan-test-secret'
process.env.REVENUECAT_SECRET_API_KEY = 'isolated-provider-fixture'
process.env.STRIPE_SECRET_KEY = 'sk_test_isolated_fixture'
const sql = postgres(scoped.toString(), { max: 1 })
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
  await sql.unsafe(`CREATE TABLE analytics_events (id text PRIMARY KEY, event_id text UNIQUE, event_name text,
    account_id text, mobile_install_id text, anonymous_id text, session_id text, platform text, source text,
    properties jsonb, occurred_at timestamp, received_at timestamp DEFAULT now());`)
  await sql.unsafe(await readFile(new URL('../../drizzle/0035_analytics_billing.sql', import.meta.url), 'utf8'))
  // Creator commissions are outside this test; billing and crediting use their real implementations.
  mock.module('@/lib/creator/attribution', () => ({ recordRevenueCatCreatorEvent: async () => null }))
  const { getEntitlementSummary, consumeEvaluationEntitlement, reserveEvaluation, finishEvaluation, creditRevenueCatScans, grantEntitlementFromCheckoutSession, revokeRevenueCatPurchase } = await import('../../lib/payments/entitlements')
  const { scanProducts } = await import('../../lib/payments/revenuecat')
  const { default: upgradesHandler } = await import('../../pages/api/payments/upgrades')
  const { default: webhookHandler } = await import('../../pages/api/payments/revenuecat-webhook')
  const { env } = await import('../../lib/env')
  const { saveAnalysisResult } = await import('../../lib/analysis/service')
  const { getStripe } = await import('../../lib/payments/stripe')
  const stripeSubscriptions = new Map<string, any>()
  getStripe().subscriptions.retrieve = (async (id: string) => stripeSubscriptions.get(id)) as any
  const { addCalendarMonths } = await import('../../lib/payments/scan-periods')
  const subscribers = new Map<string, any>()
  globalThis.fetch = (async (input: string | URL | Request) => {
    const requestUrl = String(input)
    if (!requestUrl.startsWith('https://api.revenuecat.com/v1/subscribers/')) throw new Error('Unexpected external request')
    const account = decodeURIComponent(requestUrl.split('/').at(-1)!)
    return Response.json({ subscriber: subscribers.get(account) ?? {} })
  }) as typeof fetch
  const owner = { userId: 'buyer', mobileInstallId: 'test-install' }
  await sql`INSERT INTO users (id) VALUES ('buyer'), ('alias'), ('weekly'), ('monthly'), ('yearly'), ('codes'), ('legacy'), ('stripe'), ('priority')`
  await sql`INSERT INTO sessions VALUES ('test-token-012345678901234567890123456789', 'buyer', now() + interval '1 day')`
  const request = async (method: string, body: unknown = {}) => {
    let status = 200
    let result: any
    const response = { setHeader() {}, status(code: number) { status = code; return this }, json(value: unknown) { result = value; return this } }
    await upgradesHandler({ method, headers: { authorization: 'Bearer test-token-012345678901234567890123456789' }, body } as any, response as any)
    return { status, result }
  }
  const summary = () => getEntitlementSummary(owner)
  const now = new Date()
  const purchase = (id: string, purchased = now) => ({ id, store_transaction_id: id, purchase_date: purchased.toISOString() })
  const subscriber = { non_subscriptions: {
    [scanProducts[0].productId]: [purchase('single')],
    [scanProducts[1].productId]: [purchase('pack')],
  } }
  subscribers.set('buyer', subscriber)
  await Promise.all(Array.from({ length: 5 }, () => creditRevenueCatScans('buyer', 'test-install', subscriber)))
  assert.equal((await summary()).evaluationCredits, 4, 'duplicate delivery credits exactly once')
  assert.equal((await request('GET')).result.data.products.length, 2)
  assert.equal((await request('POST', { mobileInstallId: 'test-install', transactionId: 'single' })).result.data.entitlements.evaluationCredits, 4)
  assert.equal((await request('POST', { mobileInstallId: 'test-install', transactionId: 'forged', evaluationCredits: 999, userId: 'alias' })).status, 409, 'forged client transaction and balance cannot mint credits')
  const attempts = await Promise.allSettled(Array.from({ length: 8 }, () => consumeEvaluationEntitlement(owner)))
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 4, 'only four parallel requests can spend four credits')
  assert.equal((await summary()).evaluationCredits, 0, 'restore cannot refill packs')
  subscriber.non_subscriptions[scanProducts[1].productId].push(purchase('pack-again'))
  assert.equal((await summary()).evaluationCredits, 3)
  const reserved = await reserveEvaluation(owner, 'retry-id', 'same-body')
  await assert.rejects(reserveEvaluation(owner, 'retry-id', 'same-body'), /still processing/)
  await assert.rejects(reserveEvaluation(owner, 'retry-id', 'other-body'), /already used/)
  await finishEvaluation(reserved.id, { analysis: { status: 'complete', id: 'report' } }, true)
  assert.deepEqual((await reserveEvaluation(owner, 'retry-id', 'same-body')).result, { analysis: { status: 'complete', id: 'report' } })
  assert.equal((await summary()).evaluationCredits, 2, 'retry does not spend twice')
  const failed = await reserveEvaluation(owner, 'failed', 'body')
  await Promise.all([finishEvaluation(failed.id, {}, false), finishEvaluation(failed.id, {}, false)])
  assert.equal((await summary()).evaluationCredits, 2, 'failed scan returns exactly one credit')
  const abandoned = await reserveEvaluation(owner, 'abandoned', 'body')
  await sql`UPDATE scan_reservations SET created_at = now() - interval '6 minutes' WHERE id = ${abandoned.id}`
  await Promise.all([summary(), summary()])
  assert.equal((await summary()).evaluationCredits, 2, 'abandoned request refunds exactly once')
  await assert.rejects(finishEvaluation(abandoned.id, {}, true), /expired/)
  await sql`INSERT INTO photos (id, user_id) VALUES ('durable', 'buyer')`
  const durable = await reserveEvaluation(owner, 'durable', 'body')
  await saveAnalysisResult({ photoId: 'durable', status: 'complete', metrics: {}, landmarks: {} }, { id: durable.id, photo: { id: 'durable' }, deduped: false })
  assert.equal((await reserveEvaluation(owner, 'durable', 'body')).result?.deduped, false, 'report and replay result commit together before response')
  await finishEvaluation(durable.id, {}, false)
  assert.equal((await summary()).evaluationCredits, 1, 'error after committed report cannot return its spent credit')
  await assert.rejects(saveAnalysisResult({ photoId: 'durable', status: 'complete', metrics: {}, landmarks: {} }, { id: abandoned.id, photo: { id: 'durable' }, deduped: false }), /expired/)
  await sql`UPDATE payment_entitlements SET credit_expires_at = now() - interval '1 second' WHERE stripe_checkout_session_id = 'revenuecat:pack-again'`
  subscribers.set('buyer', {})
  assert.equal((await summary()).evaluationCredits, 0, 'expired credits are neither counted nor spendable')
  await assert.rejects(consumeEvaluationEntitlement(owner), /No scans/)
  subscriber.non_subscriptions[scanProducts[1].productId] = [purchase('old-pack', addCalendarMonths(now, -7))]
  subscribers.set('buyer', subscriber)
  assert.equal((await summary()).evaluationCredits, 0, 'restoring an old pack never resets its six-month clock')
  subscribers.set('alias', subscriber)
  assert.equal((await getEntitlementSummary({ userId: 'alias' })).evaluationCredits, 0, 'aliases cannot mint duplicate credits')

  const subscription = (plan: string, transaction: string, start: Date, end: Date) => ({
    entitlements: { [env.REVENUECAT_PRO_ENTITLEMENT_ID]: { expires_date: end.toISOString(), product_identifier: `mogging.pro.${plan}` } },
    subscriptions: { [`mogging.pro.${plan}`]: { purchase_date: start.toISOString(), expires_date: end.toISOString(), store_transaction_id: transaction, store: 'app_store' } },
  })
  await sql`INSERT INTO users (id) VALUES ('cancelled-renewal')`
  const cancelled = subscription('monthly', 'cancelled-renewal-sub', new Date(now.getTime() - 1000), addCalendarMonths(now, 1))
  Object.assign(cancelled.subscriptions['mogging.pro.monthly'], { unsubscribe_detected_at: now.toISOString() })
  subscribers.set('cancelled-renewal', cancelled)
  const cancelledOwner = { userId: 'cancelled-renewal' }
  assert.equal((await getEntitlementSummary(cancelledOwner)).evaluationCredits, 2, 'cancelling renewal retains the unexpired paid allowance')
  await consumeEvaluationEntitlement(cancelledOwner)
  assert.equal((await getEntitlementSummary(cancelledOwner)).evaluationCredits, 1)
  const expiredAt = new Date(now.getTime() - 1000).toISOString()
  cancelled.entitlements[env.REVENUECAT_PRO_ENTITLEMENT_ID].expires_date = expiredAt
  cancelled.subscriptions['mogging.pro.monthly'].expires_date = expiredAt
  assert.equal((await getEntitlementSummary(cancelledOwner)).evaluationCredits, 0, 'expiry blocks the remaining subscription allowance')
  await assert.rejects(reserveEvaluation(cancelledOwner, 'expired-subscription-scan', 'body'), /No scans/)
  for (const [plan, count] of [['weekly', 1], ['monthly', 2], ['yearly', 2]] as const) {
    const start = new Date(now.getTime() - 1000)
    const end = plan === 'weekly' ? new Date(now.getTime() + 6 * 86400000) : addCalendarMonths(start, plan === 'yearly' ? 12 : 1)
    subscribers.set(plan, subscription(plan, `${plan}-transaction`, start, end))
    const account = { userId: plan }
    assert.equal((await getEntitlementSummary(account)).evaluationCredits, count, `${plan} allowance`)
    const scans = await Promise.allSettled(Array.from({ length: 5 }, () => consumeEvaluationEntitlement(account)))
    assert.equal(scans.filter(r => r.status === 'fulfilled').length, count)
    assert.equal((await getEntitlementSummary(account)).evaluationCredits, 0, `${plan} exhausted despite active subscription`)
    subscribers.set('alias', subscribers.get(plan))
    assert.equal((await getEntitlementSummary({ userId: 'alias' })).evaluationCredits, 0, 'subscription aliases cannot duplicate current allowance')
    if (plan === 'yearly') {
      // An old bucket must not be rolled into the currently verified month.
      await sql`UPDATE payment_entitlements SET credit_balance = 2, credit_expires_at = now() - interval '1 day', stripe_checkout_session_id = stripe_checkout_session_id || ':old' WHERE user_id = ${plan} AND source = 'subscription_allowance'`
      assert.equal((await getEntitlementSummary(account)).evaluationCredits, 2, 'new monthly bucket receives only two, not four')
      const rc = subscribers.get(plan)
      rc.subscriptions['mogging.pro.yearly'].refunded_at = now.toISOString()
      assert.equal((await getEntitlementSummary(account)).evaluationCredits, 0, 'refunded subscription cannot spend existing allowance')
    }
  }
  // Existing onboarding reports count toward the current allowance on rollout.
  const legacyStart = new Date(now.getTime() - 86400000)
  await sql`INSERT INTO photos (id, user_id) VALUES ('legacy-report', 'legacy')`
  await sql`INSERT INTO analyses (id, photo_id, status, created_at) VALUES ('legacy-report', 'legacy-report', 'complete', ${new Date(now.getTime() - 3600000)})`
  subscribers.set('legacy', subscription('monthly', 'legacy-sub', legacyStart, addCalendarMonths(legacyStart, 1)))
  assert.equal((await getEntitlementSummary({ userId: 'legacy' })).evaluationCredits, 1, 'onboarding scan already used before rollout counts')
  const priority = subscription('monthly', 'priority-sub', legacyStart, addCalendarMonths(legacyStart, 1)) as any
  priority.non_subscriptions = { [scanProducts[0].productId]: [purchase('priority-pack')] }
  subscribers.set('priority', priority)
  assert.equal((await getEntitlementSummary({ userId: 'priority' })).evaluationCredits, 3)
  await consumeEvaluationEntitlement({ userId: 'priority' })
  const [packLeft] = await sql`SELECT credit_balance FROM payment_entitlements WHERE stripe_checkout_session_id = 'revenuecat:priority-pack'`
  assert.equal(packLeft.credit_balance, 1, 'spend subscription allowance before purchased scans')
  await revokeRevenueCatPurchase('refund-before-purchase')
  subscribers.set('alias', { non_subscriptions: { [scanProducts[1].productId]: [purchase('refund-before-purchase')] } })
  assert.equal((await getEntitlementSummary({ userId: 'alias' })).evaluationCredits, 0, 'refund delivered before purchase remains revoked')
  // Current Stripe API stores the billing dates on subscription items.
  const stripeStart = Math.floor(now.getTime() / 1000) - 60
  const stripeSub = { id: 'sub_test', status: 'active', customer: 'cus_test', items: { data: [{
    current_period_start: stripeStart, current_period_end: stripeStart + 7 * 86400, price: { recurring: { interval: 'week' } },
  }] } }
  stripeSubscriptions.set(stripeSub.id, stripeSub)
  await grantEntitlementFromCheckoutSession({ session: {
    id: 'cs_test', created: stripeStart, status: 'complete', payment_status: 'paid', payment_intent: null,
    subscription: stripeSub, customer: 'cus_test', metadata: { accountId: 'stripe', product: 'mobile_subscription_weekly' },
  } as any })
  assert.equal((await getEntitlementSummary({ userId: 'stripe' })).evaluationCredits, 1)
  await consumeEvaluationEntitlement({ userId: 'stripe' })
  assert.equal((await getEntitlementSummary({ userId: 'stripe' })).evaluationCredits, 0)
  // A new verified billing period gets exactly one even when the previous row remains.
  stripeSub.items.data[0].current_period_start += 30
  stripeSub.items.data[0].current_period_end += 30
  assert.equal((await getEntitlementSummary({ userId: 'stripe' })).evaluationCredits, 1)
  stripeSub.status = 'canceled'
  assert.equal((await getEntitlementSummary({ userId: 'stripe' })).evaluationCredits, 0)
  subscribers.set('buyer', { non_subscriptions: { [scanProducts[1].productId]: [purchase('refundable')] } })
  assert.equal((await summary()).evaluationCredits, 3)
  const refundable = await reserveEvaluation(owner, 'refund-in-flight', 'body')
  subscribers.set('buyer', { non_subscriptions: { [scanProducts[1].productId]: [{ ...purchase('refundable'), refunded_at: now.toISOString() }] } })
  assert.equal((await summary()).evaluationCredits, 0)
  await finishEvaluation(refundable.id, {}, false)
  subscribers.set('buyer', { non_subscriptions: { [scanProducts[1].productId]: [purchase('refundable')] } })
  assert.equal((await summary()).evaluationCredits, 0, 'late failure and stale purchase restore cannot revive refund')
  await sql`DELETE FROM users WHERE id = 'buyer'`
  subscribers.set('alias', subscriber)
  assert.equal((await getEntitlementSummary({ userId: 'alias' })).evaluationCredits, 0, 'account deletion does not allow purchase replay')
  // Preserve explicitly requested code behavior, including time-limited unlimited codes.
  await sql`INSERT INTO payment_entitlements (id, user_id, mobile_install_id, stripe_checkout_session_id, product, source, subscription_status, current_period_end)
    VALUES ('code', 'codes', 'code-install', 'invite:code', 'mobile_subscription_monthly', 'admin_invite_code', 'active', now() + interval '1 day')`
  assert.equal((await getEntitlementSummary({ userId: 'codes' })).evaluationCredits, Number.MAX_SAFE_INTEGER)
  await consumeEvaluationEntitlement({ userId: 'codes' })
  await assert.rejects(grantEntitlementFromCheckoutSession({ session: { status: 'complete', payment_status: 'unpaid' } as any }), /not completed/)
  // Reproduce three packs plus three singles through delayed sync and webhook delivery.
  await sql`INSERT INTO users(id) VALUES ('pack-buyer')`
  await sql`INSERT INTO sessions VALUES ('pack-buyer-token-012345678901234567890', 'pack-buyer', now() + interval '1 day')`
  const packSubscriber = {non_subscriptions: Object.fromEntries(scanProducts.map(product => [product.productId,
    Array.from({length:3}, (_,index) => purchase(`batch-${product.product}-${index}`))]))}
  subscribers.set('pack-buyer', packSubscriber)
  env.REVENUECAT_WEBHOOK_AUTH_TOKEN = 'local-webhook-test-only'
  const invoke = async (handler: typeof upgradesHandler, body: unknown, token: string) => {
    let status = 200; let result: any
    const response = {statusCode:200, setHeader() {}, getHeader() {return 'local-test'},
      status(code: number) {status = this.statusCode = code; return this}, json(value: unknown) {result = value; return this}}
    await handler({method:'POST', headers:{authorization:`Bearer ${token}`}, body} as any, response as any)
    return {status,result}
  }
  const event = {api_version:'1.0',event:{id:'pack-webhook',type:'NON_RENEWING_PURCHASE',app_user_id:'pack-buyer',
    product_id:scanProducts[1].productId,transaction_id:'batch-evaluation_pack_3-0',environment:'PRODUCTION',
    entitlement_ids:null,is_trial_conversion:null,expiration_at_ms:null,price:9.99,currency:'USD',event_timestamp_ms:Date.now()}}
  assert.equal((await invoke(webhookHandler, event, 'wrong-token')).status,401)
  const delivered = await invoke(webhookHandler,event,env.REVENUECAT_WEBHOOK_AUTH_TOKEN)
  assert.equal(delivered.status,200)
  assert.equal((await invoke(webhookHandler,event,env.REVENUECAT_WEBHOOK_AUTH_TOKEN)).result.data.duplicate,true)
  assert.equal((await sql`SELECT * FROM subscription_events WHERE provider_event_id='pack-webhook'`).length,1)
  assert.equal((await invoke(webhookHandler,{...event,event:{...event.event,entitlement_ids:'invalid'}},env.REVENUECAT_WEBHOOK_AUTH_TOKEN)).status,400)
  const syncBody = {mobileInstallId:'pack-test-install',transactionId:'batch-evaluation_pack_3-0'}
  const synced = await invoke(upgradesHandler,syncBody,'pack-buyer-token-012345678901234567890')
  assert.equal(synced.status,200)
  assert.equal(synced.result.data.entitlements.evaluationCredits,12)
  const packOwner = {userId:'pack-buyer',mobileInstallId:'pack-test-install'}
  for(let index=0;index<12;index++) {
    const reserved = await reserveEvaluation(packOwner,`mobile-batch-${index}`,'photo-body')
    const photoId = `batch-photo-${index}`
    await sql`INSERT INTO photos(id,user_id) VALUES (${photoId},'pack-buyer')`
    const saved = await saveAnalysisResult({photoId,status:'complete',metrics:{},landmarks:{}},
      {id:reserved.id,photo:{id:photoId},deduped:false})
    assert.equal(saved.analysis.status,'complete')
    assert.deepEqual((await reserveEvaluation(packOwner,`mobile-batch-${index}`,'photo-body')).result?.analysis,JSON.parse(JSON.stringify(saved.analysis)))
  }
  assert.equal((await invoke(upgradesHandler,syncBody,'pack-buyer-token-012345678901234567890')).result.data.entitlements.evaluationCredits,0)
  assert.equal((await sql`SELECT * FROM analyses JOIN photos ON photos.id=analyses.photo_id WHERE photos.user_id='pack-buyer'`).length,12)
  await assert.rejects(reserveEvaluation(packOwner,'thirteenth','body'),/No scans/)
  subscribers.set('pack-buyer',null)
  assert.equal((await getEntitlementSummary(packOwner)).evaluationCredits,0,'provider outage preserves the ledger and cannot refill credits')
  // Provider regeneration stays inside one reservation. It never consumes a second credit.
  subscribers.set('pack-buyer',{non_subscriptions:{[scanProducts[0].productId]:[purchase('provider-credit')]}})
  assert.equal((await getEntitlementSummary(packOwner)).evaluationCredits,1)
  const { KimiAnalysisProvider } = await import('../../lib/analysis/providers/kimi')
  const { createFallbackAnalysisReport } = await import('../../lib/analysis/report')
  env.MOONSHOT_API_KEY = 'local-provider-test-only'
  const base = {faceDetected:true,pslScore:5,harmonyScore:6,dimorphismScore:6,angularityScore:6,metricScores:[],landmarks:{}}
  const valid = {...base,report:createFallbackAnalysisReport(base,5)}
  const purchaseFetch = globalThis.fetch
  let providerCalls = 0
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!String(url).endsWith('/chat/completions')) return purchaseFetch(url,init)
    providerCalls++
    return Response.json({choices:[{finish_reason:'stop',message:{content:providerCalls === 1 ? '{broken' : JSON.stringify(valid)}}]})
  }) as typeof fetch
  const recovery = await reserveEvaluation(packOwner,'provider-recovery','same-image')
  const generated = await new KimiAnalysisProvider().analyzeFace({imageDataUrl:'data:image/jpeg;base64,test',gender:'other'})
  assert.equal(providerCalls,2)
  assert.equal((await getEntitlementSummary(packOwner)).evaluationCredits,0)
  await sql`INSERT INTO photos(id,user_id) VALUES ('recovered-photo','pack-buyer')`
  await saveAnalysisResult({photoId:'recovered-photo',status:'complete',metrics:{report:generated.report},landmarks:generated.landmarks},
    {id:recovery.id,photo:{id:'recovered-photo'},deduped:false})
  assert.equal((await reserveEvaluation(packOwner,'provider-recovery','same-image')).result?.analysis != null,true)
  assert.equal((await getEntitlementSummary(packOwner)).evaluationCredits,0)
  console.log('PASS: provider correction generates a valid saved report using one credit, and replay consumes none')
  console.log('PASS: nullable consumable webhook, authorization, duplicate delivery, immediate authenticated sync, 3 packs + 3 singles -> 12 saved reports, request replay, exhaustion and restore')
  console.log('PASS: calendar limits, concurrency, replay, failures, expiry, restore, refunds, account isolation/deletion, preserved codes, unpaid checkout')
} finally {
  globalThis.fetch = realFetch
  await sql.end()
  await admin.unsafe(`DROP SCHEMA "${namespace}" CASCADE`)
  await admin.end()
}
process.exit(0)
