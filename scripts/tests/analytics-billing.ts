import assert from 'node:assert/strict'
import postgres from 'postgres'

// Explicit isolated database only: never use the application's configured DATABASE_URL.
const address = process.env.ANALYTICS_TEST_DATABASE_URL
if (!address) throw new Error('Set ANALYTICS_TEST_DATABASE_URL to a disposable localhost analytics_test database')
const url = new URL(address)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL = address
const connection = postgres(address, { max: 1 })
try {
  await connection`create table if not exists users(id text primary key)`
  await connection`create table if not exists analytics_events(id text primary key, event_id text unique, event_name text,
    account_id text references users(id), mobile_install_id text, anonymous_id text, session_id text,
    platform text, source text, properties jsonb, occurred_at timestamp, received_at timestamp default now())`
  const [existing] = await connection`select to_regclass('subscription_events') as name`
  if (!existing.name) await connection.unsafe(await Bun.file(new URL('../../drizzle/0035_analytics_billing.sql', import.meta.url)).text())
  const { processBillingWebhook, recordRevenueCatLifecycle, linkRevenueCatIdentity } = await import('../../lib/payments/billing-ledger')
  const suffix = crypto.randomUUID()
  const userId = `user-${suffix}`
  await connection`insert into users(id) values (${userId})`
  const event = { id: suffix, type: 'INITIAL_PURCHASE', app_user_id: userId, environment: 'PRODUCTION', price: 9.99, event_timestamp_ms: 1000 }
  let executions = 0
  const work = async () => { executions++; await recordRevenueCatLifecycle(event) }
  assert.equal(await processBillingWebhook('revenuecat', suffix, work), true)
  assert.equal(await processBillingWebhook('revenuecat', suffix, work), false)
  assert.equal(executions, 1)
  const [fact] = await connection`select count(*)::int as count, min(amount)::text as amount from subscription_events where provider_event_id = ${suffix}`
  assert.equal(fact.count, 1)
  assert.equal(Number(fact.amount), 9.99)

  const retryId = `${suffix}-retry`
  await assert.rejects(processBillingWebhook('test', retryId, async () => { throw new Error('simulated interruption') }))
  assert.equal(await processBillingWebhook('test', retryId, async () => {}), true)

  const staleId = `test:${suffix}-stale`
  await connection`insert into billing_webhook_receipts(id, lease_id, leased_at) values (${staleId}, 'lost-process', now() - interval '6 minutes')`
  assert.equal(await processBillingWebhook('test', `${suffix}-stale`, async () => {}), true)

  let release!: () => void
  let entered!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const first = processBillingWebhook('test', `${suffix}-concurrent`, async () => { entered(); await held })
  await waiting
  await assert.rejects(processBillingWebhook('test', `${suffix}-concurrent`, async () => {}), /in progress/)
  release()
  await first

  await recordRevenueCatLifecycle({ ...event, id: `${suffix}-refund`, type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: 3000 })
  await recordRevenueCatLifecycle({ ...event, id: `${suffix}-late`, type: 'RENEWAL', event_timestamp_ms: 2000 })
  const facts = await connection`select event_name from subscription_events where account_id = ${userId} order by occurred_at`
  assert.deepEqual(facts.map(row => row.event_name), ['subscription_started', 'subscription_renewed', 'subscription_refunded'])

  const anonymousId = `$RCAnonymousID:${suffix}`
  const secondUser = `second-${suffix}`
  await connection`insert into users(id) values (${secondUser})`
  await recordRevenueCatLifecycle({ ...event, id: `${suffix}-anonymous`, app_user_id: anonymousId })
  await linkRevenueCatIdentity(userId, anonymousId)
  await linkRevenueCatIdentity(userId, anonymousId)
  await linkRevenueCatIdentity(secondUser, anonymousId)
  await recordRevenueCatLifecycle({ ...event, id: `${suffix}-anonymous-late`, app_user_id: anonymousId })
  const linked = await connection`select account_id from subscription_events where external_user_id = ${anonymousId}`
  assert.equal(linked.length, 2)
  assert.ok(linked.every(row => row.account_id === userId))
  const identities = await connection`select account_id from analytics_events where anonymous_id = ${`revenuecat:${anonymousId}`}`
  assert.equal(identities.length, 1)
  assert.equal(identities[0].account_id, userId)
  const racingAlias = `$RCAnonymousID:race-${suffix}`
  await Promise.all([
    recordRevenueCatLifecycle({ ...event, id: `${suffix}-racing`, app_user_id: racingAlias }),
    linkRevenueCatIdentity(secondUser, racingAlias),
  ])
  const [racingFact] = await connection`select account_id from subscription_events where provider_event_id = ${`${suffix}-racing`}`
  assert.equal(racingFact.account_id, secondUser)
  const { default: exportHandler } = await import('../../pages/api/cron/analytics-export')
  process.env.CRON_SECRET = 'local-integration-test'
  process.env.POSTHOG_PROJECT_KEY = 'test-only'
  const originalFetch = globalThis.fetch
  let succeed = false
  let status = 0
  let delivered = 0
  globalThis.fetch = (async (_input: unknown, options: RequestInit) => {
    if (!succeed) return new Response('', { status: 503 })
    const body = JSON.parse(options.body as string)
    assert.equal(body.api_key, 'test-only')
    delivered += body.batch.length
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  try {
    const request = { method: 'GET', headers: { authorization: 'Bearer local-integration-test' } } as Parameters<typeof exportHandler>[0]
    const response = { setHeader() {}, status(code: number) { status = code; return this }, json() {}, end() {} } as unknown as Parameters<typeof exportHandler>[1]
    await exportHandler(request, response)
    assert.equal(status, 502)
    const [pending] = await connection`select count(*)::int as count from subscription_events where account_id = ${userId} and exported_at is null`
    assert.equal(pending.count, 5)
    succeed = true
    await exportHandler(request, response)
    assert.equal(status, 200)
    assert.ok(delivered >= 3)
    const [remaining] = await connection`select count(*)::int as count from subscription_events where account_id = ${userId} and exported_at is null`
    assert.equal(remaining.count, 0)
  } finally { globalThis.fetch = originalFetch }
  console.log('PASS: migration, organic billing, duplicate receipt, failed retry, expired lease, concurrent delivery, provider-time ordering, and refund storage')
  console.log('PASS: failed PostHog export retains durable events; successful retry acknowledges them')
  console.log('PASS: verified anonymous purchase identity, late delivery, deduplicated identify outbox, and cross-account merge protection')
} finally {
  await connection.end()
  const client = (globalThis as typeof globalThis & { postgresClient?: postgres.Sql }).postgresClient
  if (client) await client.end()
}
