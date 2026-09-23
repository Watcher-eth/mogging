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
scoped.searchParams.set('options', `-c search_path=${namespace} -c timezone=UTC`)
process.env.DATABASE_URL = scoped.toString()
process.env.NEXTAUTH_SECRET ||= 'referral-test-only-secret'
try {
  await admin.unsafe(`CREATE TABLE "${namespace}".users (id text PRIMARY KEY, created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE "${namespace}".payment_entitlements (
      id text PRIMARY KEY, mobile_install_id text NOT NULL, user_id text REFERENCES "${namespace}".users(id),
      anonymous_actor_id text, stripe_checkout_session_id text NOT NULL UNIQUE,
      stripe_customer_id text, stripe_subscription_id text, stripe_payment_intent_id text,
      product text NOT NULL, credit_balance integer NOT NULL DEFAULT 0, subscription_status text,
      current_period_end timestamp, current_period_start timestamp, credit_expires_at timestamp, activation_code_hash text, activation_code_last4 text,
      activation_code_redeemed_at timestamp, source text, metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
    );`)
  const scopedSql = postgres(scoped.toString(), { max: 1 })
  await scopedSql.unsafe(await Bun.file('drizzle/0030_referral_links.sql').text())
  await scopedSql.unsafe(await Bun.file('drizzle/0034_referral_scan_reward.sql').text())
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
  assert.deepEqual((await getReferralLink('inviter')).reward, { completed: 1, required: 3, granted: false, available: false })
  assert.equal((await scopedSql`SELECT * FROM payment_entitlements`).length, 0, 'one signup cannot unlock a scan')
  await scopedSql`INSERT INTO users (id) VALUES ('second-user')`
  await creditReferralSignup('second-user', ticket)
  assert.equal((await getReferralLink('inviter')).reward.completed, 2)
  assert.equal((await scopedSql`SELECT * FROM payment_entitlements`).length, 0, 'two signups cannot unlock a scan')
  await scopedSql`INSERT INTO users (id) VALUES ('third-user'), ('fourth-user'), ('fifth-user')`
  await Promise.all(['third-user', 'fourth-user', 'fifth-user', 'third-user'].map(id => creditReferralSignup(id, ticket)))
  const rewards = await scopedSql`SELECT user_id, credit_balance, stripe_checkout_session_id FROM payment_entitlements`
  assert.equal(rewards.length, 1, 'concurrent threshold crossings grant once')
  assert.equal(rewards[0].user_id, 'inviter')
  assert.equal(rewards[0].credit_balance, 1)
  assert.equal(rewards[0].stripe_checkout_session_id, 'referral_reward:inviter')
  assert.deepEqual((await getReferralLink('inviter')).reward, { completed: 3, required: 3, granted: true, available: true })
  await scopedSql`UPDATE payment_entitlements SET credit_balance = 0`
  await creditReferralSignup('third-user', ticket)
  assert.deepEqual((await getReferralLink('inviter')).reward, { completed: 3, required: 3, granted: true, available: false }, 'spent reward must never refill')

  await scopedSql`INSERT INTO users (id, created_at) VALUES ('other-inviter', now() - interval '1 day')`
  const otherLink = await getReferralLink('other-inviter')
  const otherTicket = await createReferralTicket(otherLink.code)
  assert.ok(otherTicket)
  await scopedSql`INSERT INTO users (id) VALUES ('contested-user')`
  await Promise.all([creditReferralSignup('contested-user', ticket), creditReferralSignup('contested-user', otherTicket)])
  assert.equal((await scopedSql`SELECT * FROM referral_signups WHERE referred_user_id = 'contested-user'`).length, 1, 'one signup cannot credit two inviters')

  await scopedSql`INSERT INTO users (id) VALUES ('legacy-user')`
  await scopedSql`INSERT INTO payment_entitlements (id, mobile_install_id, user_id, stripe_checkout_session_id, product, credit_balance, source)
    VALUES ('legacy-credit', 'account_inviter', 'inviter', 'referral_signup:legacy-user', 'evaluation', 1, 'referral_signup')`
  await creditReferralSignup('legacy-user', otherTicket)
  assert.equal((await scopedSql`SELECT * FROM referral_signups WHERE referred_user_id = 'legacy-user'`).length, 0, 'legacy referrals cannot count again')
  assert.equal((await scopedSql`SELECT credit_balance FROM payment_entitlements WHERE id = 'legacy-credit'`)[0].credit_balance, 1, 'legacy credit preserved')
  await scopedSql`INSERT INTO users (id, created_at) VALUES ('rollback-inviter', now() - interval '1 day')`
  const rollbackTicket = await createReferralTicket((await getReferralLink('rollback-inviter')).code)
  assert.ok(rollbackTicket)
  await scopedSql`INSERT INTO users (id) VALUES ('rollback-1'), ('rollback-2'), ('rollback-3')`
  await creditReferralSignup('rollback-1', rollbackTicket)
  await creditReferralSignup('rollback-2', rollbackTicket)
  await scopedSql.unsafe(`CREATE FUNCTION reject_test_reward() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.user_id = 'rollback-inviter' THEN RAISE EXCEPTION 'test reward failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER reject_test_reward BEFORE INSERT ON payment_entitlements FOR EACH ROW EXECUTE FUNCTION reject_test_reward();`)
  await assert.rejects(() => creditReferralSignup('rollback-3', rollbackTicket))
  assert.equal((await getReferralLink('rollback-inviter')).reward.completed, 2, 'failed grant rolls back signup too')
  await scopedSql.unsafe('DROP TRIGGER reject_test_reward ON payment_entitlements')
  await creditReferralSignup('rollback-3', rollbackTicket)
  assert.equal((await getReferralLink('rollback-inviter')).reward.available, true, 'retry grants after transaction rollback')
  await scopedSql.end()
  console.log('PASS: three-signup threshold, concurrent rewards, retries, cross-inviter duplicates, legacy credits, spent rewards, self-referrals, existing accounts, and signed tickets')
} finally {
  await admin.unsafe(`DROP SCHEMA "${namespace}" CASCADE`)
  await admin.end()
}
process.exit(0)
