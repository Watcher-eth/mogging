import { expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery } from './analytics'

test('authentication uses filtered customer events and independently scoped identity records without exposing identifiers', () => {
  const query = new PgDialect().sqlToQuery(analyticsQuery({ days: '30', platform: 'ios', section: 'Authentication' }, new Date('2026-10-27T22:00:00Z')))
  const selected = query.sql.split(') select json_build_object(').at(-1)!
  expect(selected).toContain('(select report from authentication)')
  expect(selected).not.toContain('(select report from creator_economics)')
  const auth = query.sql.split('auth_events as materialized (')[1].split('), \"onboarding_events0\"')[0]
  expect(auth).toContain('select * from e where event_name in')
  expect(auth).toContain("count(distinct actor) filter(where event_name='account_authenticated')")
  expect(auth).toContain("nullif(properties->>'attempt_id','') is not null")
  expect(auth).toContain('count(distinct account_id)')
  expect(auth).toContain('linked_at >=')
  expect(auth).toContain('linked_at <')
  expect(auth).toMatch(/and platform = \$\d+/)
  expect(query.params).toContain('ios')
  expect(auth).not.toContain('limit 20')
  expect(auth).not.toContain("'account_id',")
  expect(auth).not.toMatch(/json_build_object\('attempt_id'/)
})
