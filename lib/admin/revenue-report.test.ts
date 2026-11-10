import { expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { revenueReportCTEs, APP_STORE_COMMISSION_RATE } from './revenue-report'

const dialect = new PgDialect()
const query = dialect.sqlToQuery(revenueReportCTEs(7, '2026-10-21T00:00:00Z', '2026-10-28T00:00:00Z'))

test('financial reporting keeps unknown costs unknown and refunds signed', () => {
  expect(APP_STORE_COMMISSION_RATE).toBe(0.15)
  expect(query.sql).toContain('amount*tax_rate as taxes')
  expect(query.sql).toContain('count(*) filter(where proceeds is null)=0')
  expect(query.sql).toContain('sum(proceeds) as known_proceeds')
  expect(query.sql).toContain('tax_rate+provider_commission<=1')
  expect(query.params).toContain(0.15)
  expect(query.sql).not.toContain('coalesce(proceeds,0)')
})

test('renewal intent excludes trials, cancellations and billing retry; churn has a starting cohort', () => {
  expect(query.sql).toContain('has_access and not canceled and not trial and not billing_retry')
  expect(query.sql).toContain('initial.snapshot=2')
  expect(query.sql).toContain('active_at_start and (ended or ends_at<=at)')
  expect(query.params).toContain('2026-10-21T00:00:00Z')
  expect(query.params).toContain('2026-10-28T00:00:00Z')
  expect(query.sql).not.toContain('now()')
})
