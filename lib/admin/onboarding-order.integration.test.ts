import { afterAll, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import { onboardingAnalyticsSteps } from '../analytics/onboarding'

// Only an explicitly configured local socket is used; no application data is read or written.
const socket = process.env.ANALYTICS_TEST_SOCKET
const client = socket?.startsWith('/private/tmp/') ? postgres({ host: socket, port: 55439, database: 'postgres', max: 1 }) : null
if (client) afterAll(() => client.end())
const source = readFileSync(new URL('./analytics.ts', import.meta.url), 'utf8')
const start = source.indexOf('onboarding_definitions(step, label, position)')
const end = source.indexOf('), onboarding_friction', start)
const ctes = new Function('sql', 'onboardingAnalyticsSteps', 'supportedOnboarding', 'end', `return sql\`${source.slice(start, end)}) select * from onboarding_screens\``)
const at = (minute: number) => new Date(Date.UTC(2040, 0, 1, 0, minute)).toISOString()
const event = (actor: string, step: string, step_index: unknown, minute: number, version = '6') => ({
  actor, platform: 'ios', event_name: 'onboarding_step_viewed', occurred_at: at(minute),
  properties: { step, step_index, flow_id: actor, onboarding_version: version },
})
function query(events: ReturnType<typeof event>[]) {
  const body = ctes(sql, onboardingAnalyticsSteps, sql`true`, new Date('2040-02-01T00:00:00Z'))
  return new PgDialect().sqlToQuery(sql`with e as (
    select * from jsonb_to_recordset(${sql.param(events)}::jsonb)
      as events(actor text, platform text, event_name text, occurred_at timestamp, properties jsonb)
  ), ${body}`)
}

test('onboarding reporting query compiles with the production screen definitions', () => {
  const compiled = query([])
  expect(compiled.sql).toContain('sequence_index')
  expect(compiled.sql).toContain('unnest(t.steps, t.positions, t.times)')
})

test.skipIf(!client)('actual PostgreSQL preserves legacy order, optional branches and first visits without inflated drop-off', async () => {
  const compiled = query([
    event('legacy', 'protocol_preview', 1, 0, '5'), event('legacy', 'age', 2, 1, '5'),
    event('new', 'experience', 11, 0), event('new', 'evidence', 12, 1),
    event('new', 'experience', 11, 2), event('new', 'evidence', 12, 3),
    event('malformed', 'impressions', 'invalid', 0), event('malformed', 'dating', 2, 1),
  ])
  const rows = await client!.unsafe(compiled.sql, compiled.params as any[])
  expect(rows.find(row => row.step === 'protocol_preview')).toMatchObject({ viewed: '1', continued: '1' })
  expect(rows.find(row => row.step === 'experience')).toMatchObject({ viewed: '1', continued: '1' })
  expect(rows.find(row => row.step === 'evidence')).toMatchObject({ viewed: '1', continued: '0' })
  expect(rows.find(row => row.step === 'impressions')).toMatchObject({ viewed: '1', continued: '1' })
})
