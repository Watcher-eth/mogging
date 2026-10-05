import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsFilters, analyticsQuery } from './analytics'
import { reliabilityQuery } from './reliability'
import { operationalFilters, operationalQuery } from './operations'

const dialect = new PgDialect()
const now = new Date('2026-10-05T16:37:42.000Z')
const start = '2026-10-04T16:37:42.000Z'

describe('admin reporting windows', () => {
  test('accepts last 24 hours but rejects unsupported periods', () => {
    expect(analyticsFilters.parse({ days: '1' })).toEqual({ days: '1', platform: 'all' })
    expect(analyticsFilters.safeParse({ days: '0' }).success).toBe(false)
  })
  test('activity and billing share the exact rolling 24-hour window and hourly buckets', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '1', platform: 'ios' }, now))
    expect(query.params).toContain(start)
    expect(query.params).toContain(now.toISOString())
    expect(query.params.filter(value => value === 'YYYY-MM-DD"T"HH24:00:00"Z"')).toHaveLength(2)
    expect(query.sql).toContain('occurred_at >=')
    expect(query.sql).toContain('occurred_at <')
    expect(query.params).toContain('ios')
  })
  test('reliability and operational records use the same rolling window', () => {
    const query = dialect.sqlToQuery(reliabilityQuery(1, now))
    expect(query.params).toContain(start)
    expect(query.params).toContain('YYYY-MM-DD"T"HH24:00:00"Z"')
    const operations = dialect.sqlToQuery(operationalQuery(operationalFilters.parse({ days: '1', section: 'Purchases' }), now))
    expect(operations.params).toContain(start)
    expect(operations.params).toContain(now.toISOString())
  })
  test('longer reporting windows retain daily aggregation', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all' }, now))
    expect(query.params).toContain('2026-09-28T16:37:42.000Z')
    expect(query.params.filter(value => value === 'YYYY-MM-DD')).toHaveLength(2)
    expect(dialect.sqlToQuery(reliabilityQuery(7, now)).params).toContain('YYYY-MM-DD')
  })
})
