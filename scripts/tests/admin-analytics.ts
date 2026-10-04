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
    const put = async (actor: string, event: string, day: number, platform = 'ios', environment = 'production', properties: Record<string, string | number | boolean | null> = {}) => {
      const id = crypto.randomUUID()
      await tx`insert into analytics_events(id,event_id,event_name,account_id,mobile_install_id,anonymous_id,platform,environment,properties,occurred_at)
        values (${id},${id},${event},${actor === 'good' ? user : null},${platform === 'ios' ? actor : null},${actor},${platform},${environment},${tx.json(properties)},${new Date(`2040-01-${String(day).padStart(2,'0')}T00:00:00Z`)})`
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
    await tx`insert into subscription_events(id,provider,provider_event_id,provider_type,environment,event_name,amount,currency,occurred_at)
      values (${crypto.randomUUID()},'test',${crypto.randomUUID()},'test','production','test',null,'USD','2040-01-11')`
    const [row] = await testDb.execute(analyticsQuery({ days: '30', platform: 'all' }, now))
    const data = row.data as import('../../lib/admin/analytics').AnalyticsDashboard
    assert.equal(data.summary.actors, 3)
    assert.deepEqual(data.onboarding.map(step => step.actors), [1,1,1,1,1])
    assert.deepEqual(data.paywall.map(step => step.actors), [2,1,1,1])
    assert.deepEqual(data.web.map(step => step.actors), [1,1,1])
    assert.equal(data.revenue.find(row => row.currency === 'USD')?.net, '8.000000')
    assert.equal(data.revenue.find(row => row.currency === 'EUR')?.net, '20.000000')
    const usdDay = data.revenueDaily.find(row => row.currency === 'USD' && row.day === '2040-01-10')!
    assert.equal(Number(usdDay.gross), 10)
    assert.equal(Number(usdDay.refunds), 2)
    assert.equal(Number(usdDay.net), 8)
    const unknownDay = data.revenueDaily.find(row => row.currency === 'USD' && row.day === '2040-01-11')!
    assert.equal(unknownDay.net, null)
    assert.equal(unknownDay.gross, null)
    assert.equal(unknownDay.refunds, null)
    assert.equal(Number(unknownDay.missing_amount_events), 1)
    assert.equal(data.daily.reduce((sum, row) => sum + Number(row.purchase_completions), 0), 3)
    assert.equal(data.daily.reduce((sum, row) => sum + Number(row.paywall_views), 0), 2)
    assert.equal(Number(data.retention.find(row => row.day === 7)?.retained), 1)
    assert.equal(Number(data.retention.find(row => row.day === 30)?.eligible), 0)
    const [webOnly] = await testDb.execute(analyticsQuery({ days: '30', platform: 'web' }, now))
    assert.equal((webOnly.data as typeof data).summary.actors, 1)
    assert.deepEqual((webOnly.data as typeof data).revenueDaily, data.revenueDaily)
    const [empty] = await testDb.execute(analyticsQuery({ days: '7', platform: 'android' }, now))
    assert.equal((empty.data as typeof data).summary.actors, 0)
    assert.ok((empty.data as typeof data).retention.every(row => Number(row.eligible) === 0))
    // Screen cohorts: optional paths, backtracking, resume, recent users, duplicates,
    // old releases, cross-flow events, out-of-order events and seven-day boundaries.
    assert.equal(Number(data.eventMetrics.find(row => row.event === 'purchase_completed')?.events), 3)
    assert.equal(Number(data.eventMetrics.find(row => row.event === 'identity_linked')?.actors), 0)
    assert.equal(Number(data.billingProducts.find(row => row.currency === 'EUR')?.gross), 20)
    assert.ok(data.contextCoverage.every(row => Number(row.events) === 0))
    for (let index = 0; index < 25; index++) await put('good', 'report_viewed', 14, 'ios', 'production', { first_utm_campaign: `campaign-${index}`, report_id: 'report-one' })
    await put('good', 'purchase_failed', 14, 'ios', 'production', { reason_code: 'store_or_sync', productId: 'monthly' })
    const [expanded] = await testDb.execute(analyticsQuery({ days: '30', platform: 'all' }, now))
    const expandedData = expanded.data as typeof data
    assert.equal(expandedData.dimensions.filter(row => row.section === 'Acquisition' && row.dimension === 'first_utm_campaign').length, 20)
    assert.ok(expandedData.dimensions.some(row => row.section === 'Purchases' && row.dimension === 'reason_code' && row.value === 'store_or_sync'))
    assert.equal(Number(expandedData.contextCoverage.find(row => row.field === 'report_id')?.unique_ids), 1)
    assert.ok(expandedData.eventDelivery.some(row => row.platform === 'server'))
    const view = (actor: string, step: string, day: number, flow = actor, version = '2') =>
      put(actor, 'onboarding_step_viewed', day, 'ios', 'production', { step, flow_id: flow, onboarding_version: version })
    await view('screen-good', 'experience', 2)
    await view('screen-good', 'experience', 2)
    await view('screen-good', 'goals', 3) // methods was legitimately skipped
    await view('screen-good', 'protocol_bridge', 4)
    await view('screen-good', 'time', 5)
    await view('screen-good', 'paywall_plans', 7)
    await view('screen-dropped', 'experience', 2)
    await view('screen-pending', 'experience', 29)
    await view('screen-other-flow', 'experience', 2, 'one')
    await view('screen-other-flow', 'goals', 3, 'two')
    await view('screen-out-of-order', 'goals', 2)
    await view('screen-out-of-order', 'experience', 3)
    await view('screen-late', 'experience', 2)
    await view('screen-late', 'goals', 10)
    await view('screen-boundary', 'experience', 2)
    await view('screen-boundary', 'goals', 9)
    await view('screen-old', 'experience', 2, 'old', '1')
    await view('screen-resumed', 'goals', 2)
    await view('screen-resumed', 'experience', 3)
    await view('screen-resumed', 'goals', 4) // returning forward after going back
    await view('screen-done', 'evaluation_processing', 2)
    await put('screen-done', 'evaluation_completed', 3, 'ios', 'production', { flow_id: 'screen-done', onboarding_version: '2' })
    await put('screen-good', 'onboarding_step_exited', 3, 'ios', 'production', { step: 'experience', flow_id: 'screen-good', onboarding_version: '2', duration_ms: 4500 })
    await put('screen-good', 'permission_result', 3, 'ios', 'production', { step: 'upload', flow_id: 'screen-good', onboarding_version: '2', permission: 'camera', result: 'denied' })
    const [screensResult] = await testDb.execute(analyticsQuery({ days: '30', platform: 'all' }, now))
    const screens = (screensResult.data as typeof data).onboardingScreens
    const friction = (screensResult.data as typeof data).onboardingFriction
    assert.equal(Number(friction.find(row => row.reason === 'camera')?.affected_devices), 1)
    const experience = screens.find(row => row.step === 'experience')!
    assert.equal(Number(experience.viewed), 8)
    assert.equal(Number(experience.continued), 3)
    assert.equal(Number(experience.pending), 1)
    assert.equal(Number(experience.mature), 7)
    assert.equal(Number(experience.dropped), 4)
    assert.equal(Number(experience.median_ms), 4500)
    assert.equal(Number(screens.find(row => row.step === 'methods')?.viewed), 0)
    assert.equal(Number(screens.find(row => row.step === 'evaluation_processing')?.continued), 1)
    assert.ok(screens.findIndex(row => row.step === 'protocol_bridge') < screens.findIndex(row => row.step === 'time'))
    const [screensWeb] = await testDb.execute(analyticsQuery({ days: '30', platform: 'web' }, now))
    assert.ok((screensWeb.data as typeof data).onboardingScreens.every(row => Number(row.viewed) === 0))
    await tx`insert into analytics_events(id,event_id,event_name,mobile_install_id,platform,environment,properties,occurred_at)
      select ${suffix} || n, ${suffix} || n, 'onboarding_step_viewed', 'load-' || (n % 1000), 'ios', 'production',
        jsonb_build_object('onboarding_version','2','flow_id','load-' || (n % 1000),
          'step',(array['primer','protocol_preview','age','height','gender','experience','methods','goals',
            'protocol_bridge','time','commit','reveal','authentication','location','upload','scan_preview',
            'paywall_plans','paywall_account','evaluation_processing'])[(n / 1000) % 19 + 1]),
        '2040-01-15'::timestamp + (n / 1000) * interval '1 minute' from generate_series(1,20000) n`
    const started = performance.now()
    await testDb.execute(analyticsQuery({ days: '30', platform: 'all' }, now))
    const queryMs = performance.now() - started
    assert.ok(queryMs < 8000, 'Onboarding aggregation must fit the dashboard query deadline')
    console.log(`PASS: ordered funnels, deduplicated actors, sandbox exclusion, platform filters, currency isolation, mature retention, per-screen drop-off/optional paths/resume/ordering/maturity, empty states. 20k onboarding-view query: ${queryMs.toFixed(1)}ms (local synthetic fixture).`)
    throw new Error('ROLLBACK_FIXTURES')
  }).catch(error => { if (error.message !== 'ROLLBACK_FIXTURES') throw error })
} finally {
  await connection.end()
  const client = (globalThis as typeof globalThis & { postgresClient?: postgres.Sql }).postgresClient
  if (client) await client.end()
}
