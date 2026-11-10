import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const address = process.env.ANALYTICS_TEST_DATABASE_URL
if (!address) throw new Error('Use a disposable localhost analytics_test database')
const url = new URL(address)
if (url.hostname !== '127.0.0.1' || url.pathname !== '/analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL = address
process.env.NAVIGATION_MEMBERSHIP_SNAPSHOT = '1'
process.env.REVENUECAT_SECRET_API_KEY = 'fixture'
const { db } = await import('../../lib/db')
const { readNavigationMembership, invalidateNavigationMembership } = await import('../../lib/payments/navigation-membership')
const id = crypto.randomUUID()
const guest = id + '-guest'
const deferred: Promise<void>[] = []
const read = () => readNavigationMembership(id, work => deferred.push(work))
let guestPaid = true
let requests = 0
globalThis.fetch = Object.assign(async (url: string | URL | Request) => {
  const identity = decodeURIComponent(String(url).split('/').at(-1) ?? '')
  assert([id, guest].includes(identity))
  requests++
  const entitlements = identity === guest && guestPaid
    ? { pro: { expires_date: new Date(Date.now() + 86400_000).toISOString() } } : {}
  return Response.json({ subscriber: { entitlements } })
}, { preconnect: () => {} }) as typeof fetch

try {
  await db.execute(sql`insert into users(id,email) values(${id},${id + '@example.invalid'}),(${guest},${guest + '@example.invalid'})`)
  await db.execute(sql`insert into mobile_guests(user_id,claimed_by_user_id) values(${guest},${id})`)
  await db.execute(sql`insert into payment_entitlements(id,mobile_install_id,user_id,stripe_checkout_session_id,product,subscription_status,current_period_end)
    values(${id},${id},${id},${id},'web_basic_weekly','active',now()+interval '1 day')`)
  assert.deepEqual(await read(), { active: true, tier: 'pro' })
  assert.equal(requests, 2)
  assert.deepEqual(await read(), { active: true, tier: 'pro' })
  assert.equal(requests, 2)
  guestPaid = false
  await invalidateNavigationMembership([guest])
  assert.deepEqual(await read(), { active: false, tier: 'basic' })
  assert.equal(requests, 4)
  await db.execute(sql`update payment_entitlements set product='web_pro_monthly' where id=${id}`)
  assert.deepEqual(await read(), { active: true, tier: 'pro' })
  await db.execute(sql`update payment_entitlements set subscription_status='refunded' where id=${id}`)
  assert.deepEqual(await read(), { active: false })
  assert.equal(requests, 4)
  await Promise.all(deferred)
  console.log('PASS: cached verified aliases, RevenueCat invalidation, Stripe activation and immediate refund visibility')
} finally {
  await db.execute(sql`delete from payment_entitlements where id=${id}`)
  await db.execute(sql`delete from users where id in (${id},${guest})`)
}
process.exit()
