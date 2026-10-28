import { expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery } from './analytics'
import { observedCompensationPerPayer } from './creator-economics'

test('economics scopes period activity separately from lifetime balances without multiplying cost and revenue rows', () => {
  const query = new PgDialect().sqlToQuery(analyticsQuery({ days: '30', platform: 'all', section: 'CreatorEconomics' }, new Date('2026-10-27T22:00:00Z')))
  const selected = query.sql.split(') select json_build_object(').at(-1)!
  expect(selected).toContain('(select report from creator_economics)')
  expect(selected).not.toContain('(select report from creator_attribution)')
  expect(query.sql).toContain("credit = 'direct'")
  expect(query.sql).toContain("currency='USD' and status='paid' and paid_at >=")
  expect(query.sql).toContain("currency='USD' and status in ('pending','processing')")
  expect(query.sql).toContain('count(distinct customer)')
  expect(query.sql).toContain('left join economics_creator_revenue r')
  expect(query.sql).toContain('left join economics_creator_cost c')
  expect(query.sql).toContain('generate_series(')
  expect(query.sql).toContain('coalesce(activity.cash_paid,0)')
  expect(query.params).toContain('1970-01-01T00:00:00Z')
  for (const field of ['provider_reference', 'crypto_wallet_address', 'paypal_email']) expect(query.sql).not.toContain(field)
})

test('descriptive compensation ratios preserve unavailable denominators instead of claiming zero CAC', () => {
  expect(observedCompensationPerPayer(90, 10, 2)).toBe(50)
  expect(observedCompensationPerPayer(90, 10, 0)).toBeNull()
  expect(observedCompensationPerPayer(0, 0, 2)).toBe(0)
  expect(observedCompensationPerPayer(NaN, 10, 2)).toBeNull()
})
