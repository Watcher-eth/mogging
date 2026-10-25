import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsFilters, analyticsQuery } from './analytics'
import { reliabilityQuery } from './reliability'
import { operationalFilters, operationalQuery } from './operations'

const dialect = new PgDialect()
const now = new Date('2026-10-05T16:37:42.000Z')
const start = '2026-10-04T16:37:42.000Z'

describe('admin reporting windows', () => {
  test('defaults to seven days and validates page-specific reports', () => {
    expect(analyticsFilters.parse({})).toEqual({ days: '7', platform: 'all' })
    expect(analyticsFilters.safeParse({ section: 'Revenue' }).success).toBe(true)
    expect(analyticsFilters.safeParse({ section: 'unknown' }).success).toBe(false)
  })
  test('overview skips unrelated aggregates while legacy reports remain complete', () => {
    const selected = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all', section: 'Overview' }, now)).sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from user_reports')
    expect(selected).toContain('from "paid_delivery"')
    expect(selected).not.toContain('from "dimensions"')
    expect(selected).not.toContain('from "feature_retention"')
    const complete = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all' }, now)).sql.split(') select json_build_object(').at(-1)!
    expect(complete).toContain('from "dimensions"')
    expect(complete).toContain('from "feature_retention"')
  })
  test('revenue skips client funnels and tracking dimensions', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all', section: 'Revenue' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from "revenue"')
    expect(selected).not.toContain('from "onboarding4"')
    expect(selected).not.toContain('from "dimensions"')
  })
  test('accepts last 24 hours but rejects unsupported periods', () => {
    expect(analyticsFilters.parse({ days: '1' })).toEqual({ days: '1', platform: 'all' })
    expect(analyticsFilters.safeParse({ days: '0' }).success).toBe(false)
  })
  test('activity and billing share the exact rolling 24-hour window and hourly buckets', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '1', platform: 'ios' }, now))
    expect(query.params).toContain(start)
    expect(query.params).toContain(now.toISOString())
    expect(query.sql.match(/date_trunc\('hour',/g)).toHaveLength(4)
    expect(query.sql).toContain('occurred_at >=')
    expect(query.sql).toContain('occurred_at <')
    expect(query.params).toContain('ios')
  })
  test('reliability and operational records use the same rolling window', () => {
    const query = dialect.sqlToQuery(reliabilityQuery(1, now))
    expect(query.params).toContain(start)
    expect(query.sql).toContain("date_trunc('hour', occurred_at)")
    const operations = dialect.sqlToQuery(operationalQuery(operationalFilters.parse({ days: '1', section: 'Purchases' }), now))
    expect(operations.params).toContain(start)
    expect(operations.params).toContain(now.toISOString())
  })
  test('longer reporting windows retain daily aggregation', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all' }, now))
    expect(query.params).toContain('2026-09-28T16:37:42.000Z')
    expect(query.params.filter(value => value === 'America/Los_Angeles')).toHaveLength(5)
    expect(query.sql).toContain("date_trunc('day', occurred_at at time zone 'UTC',")
    expect(dialect.sqlToQuery(reliabilityQuery(7, now)).params).toContain('America/Los_Angeles')
  })
})
