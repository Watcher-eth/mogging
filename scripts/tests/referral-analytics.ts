// Uses real reporting SQL; all fixtures remain inside a rolled-back transaction.
import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery, type AnalyticsDashboard } from '../../lib/admin/analytics'

if (process.env.RUN_REFERRAL_ANALYTICS_TEST !== '1') throw new Error('Set RUN_REFERRAL_ANALYTICS_TEST=1')
const connection = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
const rollback = new Error('referral analytics test rollback')
try {
  await connection.begin(async tx => {
    const inviter = crypto.randomUUID()
    const friends = Array.from({ length: 3 }, () => crypto.randomUUID())
    for (const id of [inviter, ...friends]) await tx`insert into users(id,email) values (${id},${`referral-analytics-${id}@example.invalid`})`
    for (let i = 0; i < friends.length; i++) {
      await tx`insert into referral_signups(referred_user_id,inviter_user_id,created_at)
        values (${friends[i]},${inviter},${i === 2 ? '2039-12-01T00:00:00Z' : '2040-01-30T00:00:00Z'})`
    }
    // Repeated client claims must neither inflate nor substitute for real signups.
    for (let i = 0; i < 3; i++) {
      const id = crypto.randomUUID()
      await tx`insert into analytics_events(id,event_id,event_name,account_id,mobile_install_id,platform,environment,properties,occurred_at)
        values (${id},${id},'referral_invite_redeemed',${friends[0]},'referral-analytics-test','ios','production','{}','2040-01-30T00:00:00Z')`
    }
    const dialect = new PgDialect()
    for (const platform of ['all', 'ios'] as const) {
      const query = dialect.sqlToQuery(analyticsQuery({ days: '7', platform }, new Date('2040-01-31T00:00:00Z')))
      const [result] = await tx.unsafe(query.sql, query.params as Parameters<typeof tx.unsafe>[1])
      const data = result.data as AnalyticsDashboard
      const metric = data.eventMetrics.find(row => row.event === 'referral_invite_redeemed')!
      assert.equal(Number(metric.events), 2, 'date-bounded confirmed signups only')
      assert.equal(Number(metric.accounts), 2)
      assert.equal(Number(metric.actors), 0, 'ledger has accounts, not measured device identities')
      assert.equal(data.daily.reduce((sum, row) => sum + Number(row.referral_redemptions), 0), 2)
      const sources = data.eventPlatforms.filter(row => row.event === 'referral_invite_redeemed')
      assert.equal(sources.length, 1)
      assert.equal(sources[0].source, 'referral_ledger')
    }
    throw rollback
  })
} catch (error) {
  if (error !== rollback) throw error
} finally {
  await connection.end()
}
console.log('PASS: confirmed referral ledger, date bounds, duplicate client claims, daily totals, account/device distinction, and rollback')
