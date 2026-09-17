// Production preflight only: creates a disposable account, never submits a purchase.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'
if (process.env.RUN_PURCHASE_LIVE_TEST !== '1') throw new Error('Set RUN_PURCHASE_LIVE_TEST=1 to run')
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
const userId = randomUUID()
const token = randomBytes(32).toString('hex')
const base = 'https://www.mogging.com'
try {
  await sql`INSERT INTO users (id, email) VALUES (${userId}, ${`purchase-test-${userId}@example.invalid`})`
  await sql`INSERT INTO sessions (session_token, user_id, expires) VALUES (${token}, ${userId}, ${new Date(Date.now() + 600_000)})`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const catalog = await fetch(`${base}/api/payments/upgrades`, { headers })
  console.log('Catalog:', catalog.status, await catalog.json())
  const sync = await fetch(`${base}/api/payments/upgrades`, { method: 'POST', headers, body: JSON.stringify({ mobileInstallId: `test-${userId}` }) })
  const body = await sync.json()
  console.log('RevenueCat pre-purchase verification:', sync.status, body)
  assert.equal(sync.status, 200, 'backend must verify RevenueCat before purchase')
  assert.equal(body.data.entitlements.evaluationCredits, 0)
  assert.equal(body.data.entitlements.subscription.active, false)
  const forged = await fetch(`${base}/api/payments/upgrades`, { method: 'POST', headers, body: JSON.stringify({ mobileInstallId: `test-${userId}`, transactionId: `unpaid-${userId}` }) })
  assert.equal(forged.status, 409, 'unverified transaction must not grant credits')
  assert.equal((await sql`SELECT id FROM payment_entitlements WHERE user_id = ${userId}`).length, 0)
  console.log('PASS: live server verification, zero initial credits, invented purchase rejected')
} finally {
  await sql`DELETE FROM users WHERE id = ${userId}`
  await sql.end()
}
