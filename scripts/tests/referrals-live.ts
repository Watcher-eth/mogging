// Explicit opt-in smoke test. Creates and removes only uniquely named test accounts.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'
if (process.env.RUN_REFERRAL_LIVE_TEST !== '1') throw new Error('Set RUN_REFERRAL_LIVE_TEST=1 to run')
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
const base = 'https://www.mogging.com'
const inviter = randomUUID()
const emails = Array.from({ length: 3 }, () => `referral-test-${randomUUID()}@example.invalid`)
const token = randomBytes(32).toString('hex')
try {
  await sql`INSERT INTO users (id, email) VALUES (${inviter}, ${`referral-test-${inviter}@example.invalid`})`
  await sql`INSERT INTO sessions (session_token, user_id, expires) VALUES (${token}, ${inviter}, ${new Date(Date.now() + 600_000)})`
  const response = await fetch(`${base}/api/referrals`, { headers: { Authorization: `Bearer ${token}` } })
  assert.equal(response.status, 200, 'referral link endpoint')
  const { data } = await response.json() as { data: { url: string } }
  const landing = await fetch(data.url, { redirect: 'manual' })
  assert.equal(landing.status, 307, 'referral landing redirect')
  assert.equal(landing.headers.get('location'), '/auth/register')
  const cookie = landing.headers.getSetCookie().find(value => value.startsWith('mogging_referral='))?.split(';')[0]
  assert.ok(cookie, 'signed attribution cookie')
  for (const email of emails) {
    const signup: Response = await fetch(`${base}/api/auth/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email, password: randomBytes(24).toString('hex'), name: 'Referral smoke test' }),
    })
    assert.equal(signup.status, 201, 'referred signup')
  }
  const rewards = await sql`SELECT credit_balance FROM payment_entitlements WHERE user_id = ${inviter}`
  assert.equal(rewards.length, 1)
  assert.equal(rewards[0].credit_balance, 1)
  console.log('PASS: production invite link → signed cookie → three new signups → one scan credited')
} finally {
  await sql`DELETE FROM users WHERE id = ${inviter} OR email IN ${sql(emails)}`
  await sql.end()
}
