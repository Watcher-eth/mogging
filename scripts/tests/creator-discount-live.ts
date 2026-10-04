// Production preflight: disposable account, no purchase or charge.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import postgres from 'postgres'
if (process.env.RUN_CREATOR_DISCOUNT_LIVE_TEST !== '1') throw new Error('Set RUN_CREATOR_DISCOUNT_LIVE_TEST=1 to run')
const deployment = process.env.TEST_DEPLOYMENT_URL
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
const userId = randomUUID(), installId = `discount-test-${userId}`, session = randomBytes(32).toString('hex')
let clickId: string | undefined
async function request(path: string, body: unknown, auth = true, extraHeaders: Record<string, string> = {}) {
  const headers = { 'Content-Type': 'application/json', 'User-Agent': 'MoggingCreatorDiscountVerification/1.0', ...(auth ? { Authorization: `Bearer ${session}` } : {}), ...extraHeaders }
  if (!deployment) {
    const response = await fetch(`https://www.mogging.com${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
    return { status: response.status, body: await response.json() }
  }
  const child = Bun.spawn(['bunx', 'vercel', 'curl', path, '--deployment', deployment, '--scope', 'glimpseback', '--', '--silent', '--show-error', '--request', 'POST', ...Object.entries(headers).flatMap(([key, value]) => ['--header', `${key}: ${value}`]), '--data', JSON.stringify(body), '--write-out', '\n%{http_code}'], { cwd: '/private/tmp/mogging-campaign-deploy-psc99ag1', stdout: 'pipe', stderr: 'pipe' })
  const [output, error, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  if (code) throw new Error(`Deployment request failed (${code}): ${error.replaceAll(session, '[session]')}`)
  const split = output.lastIndexOf('\n')
  return { status: Number(output.slice(split + 1)), body: JSON.parse(output.slice(0, split)) }
}
try {
  await sql`INSERT INTO users (id, email) VALUES (${userId}, ${`creator-discount-test-${userId}@example.invalid`})`
  await sql`INSERT INTO sessions (session_token, user_id, expires) VALUES (${session}, ${userId}, ${new Date(Date.now() + 600_000)})`
  const [creator] = await sql`SELECT slug FROM creator_tracking_links WHERE is_active = true LIMIT 1`
  assert.ok(creator, 'An active creator is required for this preflight')
  const referral = await request('/api/attribution/link', { slug: creator.slug }, false)
  assert.equal(referral.status, 200, 'Active creator code must exchange for signed attribution')
  const token = new URL(referral.body.data.url).searchParams.get('attribution_token')!
  clickId = token.split('.')[0]
  const body = { mobileInstallId: installId, attributionToken: token }
  assert.equal((await request('/api/payments/creator-discount', body, false)).status, 401)
  const invalid = await request('/api/payments/creator-discount', { ...body, attributionToken: 'x'.repeat(50) })
  assert.equal(invalid.status, 200)
  assert.equal(invalid.body.data.eligible, false, 'Invented creator token cannot grant an offer')
  const offer = await request('/api/payments/creator-discount', body)
  assert.equal(offer.status, 200, 'Live RevenueCat and Stripe checks must succeed')
  assert.equal(offer.body.data.eligible, true)
  assert.equal(offer.body.data.appleProductId, 'mogging.pro.monthly.creator')
  if (process.env.TEST_CREATOR_CHECKOUT === '1') {
    const checkoutBody = { mobileInstallId: installId, product: 'mobile_subscription_monthly', source: 'creator_discount_verification' }
    const cookie = { Cookie: `mogging_creator_attribution=${encodeURIComponent(token)}` }
    const checkout = await request('/api/payments/web-checkout', checkoutBody, true, cookie)
    assert.equal(checkout.status, 200, 'Live monthly discount checkout must be created without charging')
    const repeated = await request('/api/payments/web-checkout', checkoutBody, true, cookie)
    assert.equal(repeated.status, 200)
    assert.equal(repeated.body.data.url, checkout.body.data.url, 'Live retries must reuse the open discount checkout')
    await Bun.write('/private/tmp/mogging-creator-checkout-url.txt', checkout.body.data.url)
    console.log('PASS: live discount checkout created and repeated request reused the same session; no payment submitted.')
  }
  const sync = await request('/api/payments/upgrades', { mobileInstallId: installId })
  assert.equal(sync.status, 200, 'Live RevenueCat verification must succeed')
  assert.equal(sync.body.data.entitlements.evaluationCredits, 0)
  assert.equal(sync.body.data.entitlements.subscription.active, false)
  assert.equal((await sql`SELECT id FROM payment_entitlements WHERE user_id = ${userId}`).length, 0, 'An offer must never grant unpaid access')
  console.log('PASS: live signed creator code, authenticated eligibility, Apple creator product, RevenueCat verification, invalid-token rejection and zero unpaid access.')
} finally {
  await sql`DELETE FROM creator_attribution_events WHERE user_id = ${userId}`
  await sql`DELETE FROM analytics_events WHERE account_id = ${userId}`
  if (clickId) await sql`DELETE FROM creator_attribution_clicks WHERE id = ${clickId}`
  await sql`DELETE FROM users WHERE id = ${userId}`
  await sql.end()
}
