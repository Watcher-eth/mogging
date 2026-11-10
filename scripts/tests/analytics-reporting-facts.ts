import assert from 'node:assert/strict'
import { PgDialect } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import { WEB_FLOW_VERSION } from '../../lib/analytics/web-context'

const url = new URL(process.env.ANALYTICS_TEST_DATABASE_URL ?? '')
if (url.hostname !== '127.0.0.1' || url.pathname !== '/analytics_test') throw new Error('Use a disposable localhost analytics_test database')
process.env.DATABASE_URL = url.href
const { analyticsFilters, analyticsQuery } = await import('../../lib/admin/analytics')
const { refreshAnalyticsReportingFacts } = await import('../../lib/admin/analytics-reporting-facts')
const client = postgres(url.href, { max: 1, prepare: false })
const dialect = new PgDialect()
const hour = 3600_000
const end = new Date(Math.floor(Date.now() / hour) * hour + 17 * 60_000)
const base = new Date(end.getTime() - 8 * hour)
const at = (minutes: number) => new Date(base.getTime() + minutes * 60_000)
const fixture = crypto.randomUUID()
const user = `fixture-${fixture}`
const checkout = `cs_live_${fixture}`
const tracked = { flow_id: fixture, flow_version: WEB_FLOW_VERSION, surface: 'web_analysis', path: '/analysis', device_platform: 'desktop' }
const ids: string[] = []
async function insert(event: string, offset: number, properties: Record<string, string | number> = tracked,
  options: { platform?: string, account?: string, source?: string, session?: string, actor?: string } = {}) {
  const id = crypto.randomUUID()
  ids.push(id)
  await client`insert into analytics_events(id,event_id,event_name,platform,source,account_id,session_id,anonymous_id,occurred_at,properties)
    values (${id},${id},${event},${options.platform ?? 'web'},${options.source ?? 'web'},${options.account ?? null},
      ${options.session ?? null},${options.actor ?? fixture},${at(offset)},${client.json(properties)})`
  return id
}

async function compare() {
  for (const [section, days, platform] of [
    ['Overview','1','all'], ['Overview','7','all'], ['Overview','1','ios'], ['WebJourney','1','all'], ['WebJourney','7','web'],
  ] as const) {
    const filters = analyticsFilters.parse({ section, days, platform })
    await client.begin('isolation level repeatable read read only', async tx => {
      await tx`set local jit = off`
      const run = async (model: boolean) => {
        const query = dialect.sqlToQuery(analyticsQuery(filters, end, model))
        const [row] = await tx.unsafe(query.sql, query.params as Parameters<typeof tx.unsafe>[1])
        return row.data
      }
      const raw = await run(false)
      const facts = await run(true)
      assert.deepEqual(facts, raw, `${section}/${days}/${platform}`)
      if (section === 'WebJourney') {
        assert.equal(facts.webJourney.summary[0].paid_journeys, 1)
        assert.equal(facts.webJourney.summary[0].report_viewed, 1)
      }
    })
  }
}
try {
  await client`insert into users(id,email) values (${user},${user + '@example.invalid'})`
  await insert('page_viewed', 1, { ...tracked, path: '/' })
  await insert('onboarding_step_viewed', 2, { ...tracked, step: 'capture.front' })
  await insert('onboarding_step_exited', 3, { ...tracked, step: 'capture.front', duration_ms: 1234 })
  await insert('paywall_viewed', 4)
  await insert('purchase_started', 5, { ...tracked, attempt_id: fixture })
  await insert('checkout_started', 6, { ...tracked, attempt_id: fixture }, { platform: 'server', account: user, session: checkout, source: 'web_analysis' })
  await insert('checkout_completed', 7, { mode: 'subscription' }, { platform: 'server', account: user, session: checkout, source: 'stripe_verified' })
  await insert('evaluation_request_completed', 8, { ...tracked, report_id: fixture }, { platform: 'server', account: user, source: 'web_analysis' })
  await insert('report_viewed', 9, { ...tracked, report_id: fixture }, { account: user })
  await insert('report_viewed', 10, { ...tracked, report_id: fixture }, { account: user })
  await insert('progress_viewed', 55, {}, { platform: 'ios', actor: 'ios-fixture' })
  await insert('progress_viewed', 56, {}, { platform: 'ios', actor: 'ios-fixture' })
  await insert('page_viewed', 60, { path: '/admin-test' })
  await insert('page_viewed', 61, { path: '/admin/creator' })
  await insert('page_viewed', 62, { path: '/other', runtime_environment: 'sandbox' }, { session: 'sandbox-fixture' })
  await insert('page_viewed', 63, { path: '/other' }, { session: 'sandbox-fixture' })
  await insert('page_viewed', 64, { path: '/battle' })
  await insert('evaluation_failed', 478, {}, { platform: 'ios' }) // partial hour
  await insert('evaluation_failed', -16 * 60 - 1, {}, { platform: 'ios' }) // before 24-hour window
  await compare() // cold model falls back to raw
  assert((await refreshAnalyticsReportingFacts(8, end)).length > 0)
  const [{ compaction }] = await client`select coalesce(max(event_count),0)::integer as compaction from analytics_reporting_facts where model='overview'`
  assert(compaction > 1)
  await compare()
  const [{ changes }] = await client`select count(*)::integer as changes from analytics_reporting_changes`
  await client`update analytics_events set exported_at=now() where id=${ids[0]}`
  assert.equal((await client`select count(*)::integer as changes from analytics_reporting_changes`)[0].changes, changes)
  const late = await insert('evaluation_completed', 11, { report_id: fixture }, { platform: 'ios', account: user })
  await compare() // historical insert invalidates a covered hour
  await refreshAnalyticsReportingFacts(3, end)
  await client`update analytics_events set occurred_at=${at(95)}, event_name='evaluation_failed' where id=${late}`
  await compare() // updates that move an event invalidate both hours
  await refreshAnalyticsReportingFacts(3, end)
  await client`delete from analytics_events where id=${late}`
  await compare()
  await refreshAnalyticsReportingFacts(3, end)
  // Audience definitions remain live even if no reporting fact changed.
  await client`insert into users(id,email,analytics_internal) values ('internal-fixture','internal@example.invalid',true)`
  await insert('page_viewed', 130, { path: '/' }, { account: 'internal-fixture', actor: 'ios-fixture' })
  await compare()
  console.log('PASS: exact Overview and Web Journey parity across cold, compacted, late, updated and deleted data')
} finally {
  await client`delete from analytics_events where id in ${client(ids)}`
  await client`delete from users where id in (${user}, 'internal-fixture')`
  await client.end()
  process.exitCode ??= 0
}
