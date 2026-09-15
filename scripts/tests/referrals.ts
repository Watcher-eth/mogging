// Runs against an isolated, temporary schema; never grants credits to real accounts.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import postgres from 'postgres'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL required')
const admin = postgres(url, { max: 1 })
const namespace = `referral_test_${randomUUID().replaceAll('-', '')}`
await admin.unsafe(`CREATE SCHEMA "${namespace}"`)
const scoped = new URL(url)
scoped.searchParams.set('options', `-c search_path=${namespace}`)
process.env.DATABASE_URL = scoped.toString()
process.env.NEXTAUTH_SECRET ||= 'referral-test-only-secret'
try {
  await admin.unsafe(`CREATE TABLE "${namespace}".users (id text PRIMARY KEY, created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE "${namespace}".payment_entitlements (
      id text PRIMARY KEY, mobile_install_id text NOT NULL, user_id text REFERENCES "${namespace}".users(id),
      anonymous_actor_id text, stripe_checkout_session_id text NOT NULL UNIQUE,
      stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent_id text,
      product text NOT NULL, credit_balance integer NOT NULL DEFAULT 0, subscription_status text,
      current_period_end timestamp, activation_code_hash text, activation_code_last4 text,
      activation_code_redeemed_at timestamp, source text, metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    );`)
  const scopedSql = postgres(scoped.toString(), { max: 1 })
  await scopedSql.unsafe(await Bun.file('drizzle/0030_referral_links.sql').text())
  const { getReferralLink, createReferralTicket, readReferralTicket, creditReferralSignup } = await import('../../lib/referrals/service')
  await scopedSql`INSERT INTO users (id, created_at) VALUES ('inviter', now() - interval '1 day'), ('existing', now() - interval '1 day')`
  const links = await Promise.all([getReferralLink('inviter'), getReferralLink('inviter')])
  assert.equal(links[0].url, links[1].url)
  const ticket = await createReferralTicket(links[0].code)
  assert.ok(ticket)
  assert.equal(await createReferralTicket('invalid'), null)
  assert.equal(readReferralTicket(ticket + 'a'), null)
  assert.equal(readReferralTicket(ticket, Date.now() + 31 * 86400_000), null)
  await scopedSql`INSERT INTO users (id) VALUES ('new-user')`
  await Promise.all(Array.from({ length: 5 }, () => creditReferralSignup('new-user', ticket)))
  await creditReferralSignup('existing', ticket)
  await creditReferralSignup('inviter', ticket)
  await creditReferralSignup('new-user', ticket.slice(0, -1) + (ticket.endsWith('a') ? 'b' : 'a'))
  const rewards = await scopedSql`SELECT user_id, credit_balance, stripe_checkout_session_id FROM payment_entitlements`
  assert.equal(rewards.length, 1)
  assert.equal(rewards[0].user_id, 'inviter')
  assert.equal(rewards[0].credit_balance, 1)
  await scopedSql`INSERT INTO users (id) VALUES ('second-user')`
  await creditReferralSignup('second-user', ticket)
  const total = await scopedSql`SELECT sum(credit_balance)::integer AS balance FROM payment_entitlements`
  assert.equal(total[0].balance, 2)
  await scopedSql.end()
  console.log('PASS: stable links, invalid/expired tickets, concurrent retries, existing accounts, self-referrals, and one credit per new signup')
} finally {
  await admin.unsafe(`DROP SCHEMA "${namespace}" CASCADE`)
  await admin.end()
}
process.exit(0)
