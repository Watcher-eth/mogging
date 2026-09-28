import assert from 'node:assert/strict'
import postgres from 'postgres'

const address = process.env.ANALYTICS_TEST_DATABASE_URL
if (!address) throw new Error('Set a disposable localhost analytics_test database; apply the analytics-billing test migration first')
const url = new URL(address)
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL = address
const connection = postgres(address, { max: 1 })
try {
  const { analyticsFilters, analyticsQuery } = await import('../../lib/admin/analytics')
  assert.equal(analyticsFilters.safeParse({ days: '999' }).success, false)
  assert.equal(analyticsFilters.safeParse({ platform: ['ios','web'] }).success, false)
  const now = new Date('2040-01-31T00:00:00Z')
  // Rollback isolates each run, including performance fixtures.
  await connection.begin(async tx => {
    const { PgDialect } = await import('drizzle-orm/pg-core')
    const dialect = new PgDialect()
    const testDb = { execute(query: import('drizzle-orm').SQL) {
      const compiled = dialect.sqlToQuery(query)
      return tx.unsafe(compiled.sql, compiled.params as Parameters<typeof tx.unsafe>[1])
    } }
    const suffix = crypto.randomUUID()
    const user = `analytics-${suffix}`
    await tx`insert into users(id) values (${user})`
    const put = async (actor: string, event: string, day: number, platform = 'ios', environment = 'production') => {
      const id = crypto.randomUUID()
      await tx`insert into analytics_events(id,event_id,event_name,account_id,mobile_install_id,anonymous_id,platform,environment,properties,occurred_at)
        values (${id},${id},${event},${actor === 'good' ? user : null},${platform === 'ios' ? actor : null},${actor},${platform},${environment},'{}',${new Date(`2040-01-${String(day).padStart(2,'0')}T00:00:00Z`)})`
    }
    for (const [event, day] of [['onboarding_started',2],['paywall_viewed',3],['plan_selected',3],['purchase_started',4],['purchase_completed',5],['evaluation_completed',6],['report_viewed',7],['report_viewed',13]] as const) await put('good',event,day)
    await put('good','purchase_completed',5) // Duplicate UX event must not duplicate funnel people.
    await put('out-of-order','purchase_completed',2)
    await put('out-of-order','paywall_viewed',3)
    await put('sandbox','onboarding_started',2,'ios','development')
    await put('web','page_viewed',2,'web')
    await put('web','landing_cta_clicked',3,'web')
    await put('web','app_store_redirected',3,'web')
    await put('server-only','identity_linked',3,'server')
    const malformed = crypto.randomUUID()
    await tx`insert into analytics_events(id,event_id,event_name,mobile_install_id,platform,environment,properties,occurred_at)
      values (${malformed},${malformed},'screen_exited','good','ios','production','{"screen":"Report","duration_ms":"not-a-number"}','2040-01-08')`
    for (const [currency, amount] of [['USD','10'],['USD','-2'],['EUR','20']]) {
      await tx`insert into subscription_events(id,provider,provider_event_id,provider_type,environment,event_name,amount,currency,occurred_at)
        values (${crypto.randomUUID()},'test',${crypto.randomUUID()},'test','production','test',${amount},${currency},'2040-01-10')`
    }
    const [row] = await testDb.execute(analyticsQuery({ days: '30', platform: 'all' }, now))
    const data = row.data as import('../../lib/admin/analytics').AnalyticsDashboard
    assert.equal(data.summary.actors, 3)
    assert.deepEqual(data.onboarding.map(step => step.actors), [1,1,1,1,1])
    assert.deepEqual(data.paywall.map(step => step.actors), [2,1,1,1])
    assert.deepEqual(data.web.map(step => step.actors), [1,1,1])
    assert.equal(data.revenue.find(row => row.currency === 'USD')?.net, '8.000000')
    assert.equal(data.revenue.find(row => row.currency === 'EUR')?.net, '20.000000')
    assert.equal(Number(data.retention.find(row => row.day === 7)?.retained), 1)
    assert.equal(Number(data.retention.find(row => row.day === 30)?.eligible), 0)
    const [webOnly] = await testDb.execute(analyticsQuery({ days: '30', platform: 'web' }, now))
    assert.equal((webOnly.data as typeof data).summary.actors, 1)
    const [empty] = await testDb.execute(analyticsQuery({ days: '7', platform: 'android' }, now))
    assert.equal((empty.data as typeof data).summary.actors, 0)
    assert.ok((empty.data as typeof data).retention.every(row => Number(row.eligible) === 0))
    await tx`insert into analytics_events(id,event_id,event_name,mobile_install_id,platform,environment,properties,occurred_at)
      select ${suffix} || n, ${suffix} || n, 'screen_viewed', 'load-' || (n % 1000), 'ios', 'production', '{}', '2040-01-15'::timestamp from generate_series(1,20000) n`
    const started = performance.now()
    await testDb.execute(analyticsQuery({ days: '30', platform: 'all' }, now))
    console.log(`PASS: ordered funnels, deduplicated actors, sandbox exclusion, platform filters, currency isolation, mature retention, empty states. 20k-event query: ${(performance.now() - started).toFixed(1)}ms (local synthetic fixture).`)
    throw new Error('ROLLBACK_FIXTURES')
  }).catch(error => { if (error.message !== 'ROLLBACK_FIXTURES') throw error })
} finally {
  await connection.end()
  const client = (globalThis as typeof globalThis & { postgresClient?: postgres.Sql }).postgresClient
  if (client) await client.end()
}
