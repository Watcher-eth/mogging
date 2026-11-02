import { expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { creatorPerformanceInputQuery } from './creator-performance-snapshot'

test('performance snapshot reads only required post and completed-payment fields with a fixed cutoff', () => {
  const now = new Date('2026-10-27T22:00:00Z')
  const query = new PgDialect().sqlToQuery(creatorPerformanceInputQuery(now))
  expect(query.sql).toContain('where not s.is_draft')
  expect(query.sql).toContain('min(u.created_at)')
  expect(query.sql).toContain("u.type = 'submitted'")
  expect(query.sql).toContain('dates.submitted_at <')
  expect(query.sql).toContain("status = 'paid'")
  expect(query.sql).toContain('paid_at is null or paid_at <')
  expect(query.params.every(value => value === now.toISOString())).toBe(true)
  expect(query.sql.match(/limit 1/g)).toHaveLength(1)
  expect(query.sql).toContain('from creator_submission_analytics a')
  expect(query.sql).toContain("'{metricsVerified,totalViews}' = 'true'")
  expect(query.sql).toContain('order by a.assessed_at desc limit 1')
  for (const privateField of ['email', 'provider_reference', 'crypto_wallet', 'video_url', 'review_note', 'analytics_screenshot']) expect(query.sql).not.toContain(privateField)
})
