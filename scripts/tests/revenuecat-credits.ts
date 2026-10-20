// Runs against an isolated, temporary schema; never grants credits to real accounts.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'
import { readFile } from 'node:fs/promises'

const url = process.env.DATABASE_URL
if (!url || !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw new Error('Set DATABASE_URL to an isolated local PostgreSQL server')
const admin = postgres(url, { max: 1 })
const namespace = `purchase_test_${randomUUID().replaceAll('-', '')}`
await admin.unsafe(`CREATE SCHEMA "${namespace}"`)
const scoped = new URL(url)
scoped.searchParams.set('options', `-c search_path=${namespace}`)
process.env.DATABASE_URL = scoped.toString()
process.env.NEXTAUTH_SECRET ||= 'purchase-test-only-secret'
// This test exercises the ledger with fixtures, never Apple's or RevenueCat's live purchase APIs.
delete process.env.REVENUECAT_SECRET_API_KEY
try {
  await admin.unsafe(`CREATE TABLE "${namespace}".users (id text PRIMARY KEY, created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE "${namespace}".payment_entitlements (
      id text PRIMARY KEY, mobile_install_id text NOT NULL, user_id text CONSTRAINT payment_entitlements_user_id_users_id_fk REFERENCES "${namespace}".users(id),
      anonymous_actor_id text, stripe_checkout_session_id text NOT NULL UNIQUE,
      stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent_id text,
      product text NOT NULL, credit_balance integer NOT NULL DEFAULT 0, subscription_status text,
      current_period_end timestamp, activation_code_hash text, activation_code_last4 text,
      activation_code_redeemed_at timestamp, source text, metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    );`)
  const scopedSql = postgres(scoped.toString(), { max: 1 })
  await scopedSql.unsafe(await readFile(new URL('../../drizzle/0053_mobile_guest_accounts.sql', import.meta.url), 'utf8'))
  await scopedSql.unsafe(await readFile(new URL('../../drizzle/0031_scan_allowances.sql', import.meta.url), 'utf8'))
  const { creditRevenueCatScans, consumeEvaluationEntitlement, getEntitlementSummary } = await import('../../lib/payments/entitlements')
  const { readRevenueCatPro, scanProducts } = await import('../../lib/payments/revenuecat')
  await scopedSql`INSERT INTO users (id) VALUES ('buyer'), ('other-account')`
  const subscriber = { non_subscriptions: {
    [scanProducts[0].productId]: [{ id: 'single', store_transaction_id: 'apple-single', purchase_date: new Date().toISOString(), is_sandbox: true }],
    [scanProducts[1].productId]: [{ id: 'pack', store_transaction_id: 'apple-pack', purchase_date: new Date().toISOString(), is_sandbox: true }],
  } }
  const owner = { userId: 'buyer', mobileInstallId: 'purchase-test-install' }
  await Promise.all(Array.from({ length: 5 }, () => creditRevenueCatScans(owner.userId, owner.mobileInstallId, subscriber)))
  assert.equal((await getEntitlementSummary(owner, subscriber)).evaluationCredits, 4)
  assert.equal((await scopedSql`SELECT * FROM payment_entitlements`).length, 2)
  // An alias or a second signed-in account must not mint the same purchases twice.
  await creditRevenueCatScans('other-account', 'other-install', subscriber)
  assert.equal((await getEntitlementSummary({ userId: 'other-account' }, null)).evaluationCredits, 0)
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => consumeEvaluationEntitlement(owner)))
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 4)
  assert.equal((await getEntitlementSummary(owner, subscriber)).evaluationCredits, 0)
  // Re-sync/restore must preserve spent balances, then a repeat pack adds exactly three.
  subscriber.non_subscriptions[scanProducts[1].productId].push({ id: 'pack-again', store_transaction_id: 'apple-pack-again', purchase_date: new Date().toISOString(), is_sandbox: true })
  assert.equal((await getEntitlementSummary(owner, subscriber)).evaluationCredits, 3)
  const refunded = { non_subscriptions: { [scanProducts[1].productId]: [{ id: 'pack-again', refunded_at: new Date().toISOString() }] } }
  assert.equal((await getEntitlementSummary(owner, refunded)).evaluationCredits, 0)
  await creditRevenueCatScans(owner.userId, owner.mobileInstallId, subscriber)
  assert.equal((await getEntitlementSummary(owner, null)).evaluationCredits, 0)
  const { env } = await import('../../lib/env')
  const pro = (expires_date: string | null) => ({ entitlements: { [env.REVENUECAT_PRO_ENTITLEMENT_ID]: { expires_date } } })
  assert.equal(readRevenueCatPro(pro(new Date(Date.now() + 60_000).toISOString()))?.active, true)
  assert.equal(readRevenueCatPro(pro(new Date(Date.now() - 60_000).toISOString()))?.active, false)
  assert.equal(readRevenueCatPro(pro(null))?.active, true)
  assert.equal(readRevenueCatPro(null), null)
  await scopedSql.end()
  console.log('PASS: 1+3 credits, concurrent duplicate sync, account isolation, concurrent consumption, exhausted credits, restore without refills, repeat purchases, refunds, active/expired Pro')

} finally {
  await admin.unsafe(`DROP SCHEMA "${namespace}" CASCADE`)
  await admin.end()
}
process.exit(0)
