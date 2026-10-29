import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsFilters, analyticsQuery } from './analytics'
import { reliabilityQuery } from './reliability'
import { operationalFilters, operationalQuery } from './operations'

const dialect = new PgDialect()
const now = new Date('2026-10-05T16:37:42.000Z')
const start = '2026-10-04T16:37:42.000Z'

describe('admin reporting windows', () => {
  test('snapshot JSON builders remain within PostgreSQL argument limits and reject trailing commas', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '30', platform: 'all' }, now)).sql
    expect(query).not.toMatch(/,\s*\)/)
    for (const match of query.matchAll(/jsonb?_build_object\(/g)) {
      let depth = 1, argumentsCount = 1, quote = ''
      for (let i = match.index! + match[0].length; i < query.length && depth > 0; i++) {
        const char = query[i]
        if (quote) {
          if (char === quote) { if (query[i + 1] === quote) i++; else quote = '' }
          continue
        }
        if (char === "'" || char === '"') quote = char
        else if (char === '(') depth++
        else if (char === ')') depth--
        else if (char === ',' && depth === 1) argumentsCount++
      }
      expect(argumentsCount).toBeLessThanOrEqual(100)
      expect(argumentsCount % 2).toBe(0)
    }
  })
  test('defaults to seven days and validates page-specific reports', () => {
    expect(analyticsFilters.parse({})).toEqual({ days: '7', platform: 'all' })
    expect(analyticsFilters.safeParse({ section: 'Revenue' }).success).toBe(true)
    expect(analyticsFilters.safeParse({ section: 'unknown' }).success).toBe(false)
  })
  test('overview skips unrelated aggregates while legacy reports remain complete', () => {
    const selected = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all', section: 'Overview' }, now)).sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from scan_ledger')
    expect(selected).not.toContain('from user_reports')
    expect(selected).not.toContain('from "onboarding4"')
    expect(selected).not.toContain('from "paywall2"')
    expect(selected).toContain('from "paid_delivery"')
    expect(selected).not.toContain('from "dimensions"')
    expect(selected).not.toContain('from "feature_retention"')
    expect(dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all', section: 'Overview' }, now)).sql).not.toContain('from creator_attribution_events')
    const complete = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all' }, now)).sql.split(') select json_build_object(').at(-1)!
    expect(complete).toContain('from "dimensions"')
    expect(complete).toContain('from "feature_retention"')
  })
  test('revenue skips client funnels and tracking dimensions', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all', section: 'Revenue' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from "revenue"')
    expect(selected).toContain('from "revenue_comparison"')
    expect(selected).toContain('from "billing_reporting"')
    expect(selected).not.toContain('from "onboarding4"')
    expect(selected).not.toContain('from "dimensions"')
  })
  test('revenue compares currency-specific equal windows and separates scheduled cancellations from ended access', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '30', platform: 'all', section: 'Revenue' }, now))
    const comparison = query.sql.split('revenue_comparison as (')[1].split('), billing_reporting as (')[0]
    expect(comparison).toContain("coalesce(h.currency,'UNKNOWN')")
    expect(comparison).toContain("::integer * interval '1 day'")
    expect(comparison).toContain('as previous_net')
    expect(comparison).toContain('as missing_amount_events')
    expect(query.params).toContain(30)
    const scheduled = query.sql.split("select 'scheduled_cancellations'")[1].split('), revenue_daily as (')[0]
    expect(scheduled).toContain('canceled and not ended and ends_at > at')
    expect(scheduled).toContain('canceled and not ended and ends_at is null')
    const revenue = query.sql.split('), revenue as (')[1].split('), revenue_comparison as (')[0]
    expect(revenue).toContain("provider || ':external:' || external_user_id")
    expect(revenue).not.toContain('limit')
  })
  test('acquisition uses uncapped totals and independent homepage outcomes without the old web funnel', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '7', platform: 'all', section: 'Acquisition' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from "acquisition_summary"')
    expect(selected).toContain('from "landing_summary"')
    expect(selected).not.toContain('from "web1"')
    const summary = query.sql.split('acquisition_summary as (')[1].split('), acquisition as (')[0]
    expect(summary).toContain('count(*) as devices')
    expect(summary).toContain('from acquisition_activity e join acquisition_actors a')
    expect(query.sql).toContain('from e where actor is not null group by actor')
    expect(selected).not.toContain('from "dimensions"')
    expect(summary).toContain('sourced_devices')
    expect(summary).not.toContain('limit')
    expect(query.sql).toContain('as store_clickers')
    expect(query.sql).toContain('as website_visitors')
  })
  test('accepts last 24 hours but rejects unsupported periods', () => {
    expect(analyticsFilters.parse({ days: '1' })).toEqual({ days: '1', platform: 'all' })
    expect(analyticsFilters.safeParse({ days: '0' }).success).toBe(false)
  })
  test('experiments include assignment history without acquisition or scan aggregates', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '30', platform: 'all', section: 'Experiments' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from "landing_experiment_daily"')
    expect(selected).toContain('from "landing_experiments"')
    expect(selected).not.toContain('from "acquisition_summary"')
    expect(selected).not.toContain('from scan_ledger')
    expect(query.sql).toContain('as latest_exposure')
    expect(query.sql).toContain('where l.store and not l.handoff')
  })
  test('creator attribution deduplicates overall identities without mixing credit or currency and scopes to its own reports', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '30', platform: 'all', section: 'CreatorAttribution' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('(select report from creator_attribution)')
    expect(selected).not.toContain('from "daily"')
    expect(selected).not.toContain('from "revenue"')
    expect(selected).not.toContain('from "retention"')
    const summary = query.sql.split('creator_summary as (')[1].split('), creator_accounts as (')[0]
    expect(summary).toContain('count(distinct customer)')
    expect(summary).toContain('grouping sets ((credit,upper(currency),creator_id),(credit,upper(currency)))')
    expect(summary).not.toContain('limit')
    expect(summary).toContain("event_type in ('payment','refund','dispute') and amount_cents <> 0")
    const events = query.sql.split('creator_events as materialized (')[1].split('), creator_credits as materialized (')[0]
    expect(events).toContain("e.metadata->>'billingEventId'")
    expect(events).toContain('coalesce(s.occurred_at,e.created_at)')
    expect(events).toContain('internal_accounts')
    expect(events).toContain('c.is_bot')
    expect(query.sql).toContain("'direct'::text as credit")
    expect(query.sql).toContain("'first'::text")
  })
  test('retention preserves exact mature windows and excludes general activity and cancellations', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '90', platform: 'ios', section: 'Retention' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from "retention_weekly"')
    expect(selected).toContain('from "retention_coverage"')
    expect(selected).not.toContain('from "daily"')
    expect(selected).not.toContain('from "cancellations"')
    expect(selected).not.toContain('from "actions"')
    const outcomes = query.sql.split('retention_outcomes as materialized (')[1].split('), retention as (')[0]
    expect(outcomes).toContain("(n.day + 1) * interval '1 day'")
    expect(outcomes).toContain("e.occurred_at >= a.at + n.day * interval '1 day'")
    expect(outcomes).toContain("e.occurred_at < a.at + (n.day + 1) * interval '1 day'")
    expect(outcomes).toContain('e.account_id = a.account_id')
    const aggregate = query.sql.split('), retention as (')[1].split('), retention_weekly as (')[0]
    expect(aggregate).toContain('count(o.account_id)')
    expect(aggregate).toContain('o.eligible and o.returned')
    const weekly = query.sql.split('), retention_weekly as (')[1].split('), retention_coverage as (')[0]
    expect(weekly).toContain('where day = 7')
    expect(weekly).toContain('eligible and returned')
  })
  test('onboarding completion cohorts match device and flow with ordered seven-day outcomes', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '30', platform: 'all', section: 'Onboarding' }, now))
    const selected = query.sql.split(') select json_build_object(').at(-1)!
    expect(selected).toContain('from "onboarding_summary"')
    expect(selected).toContain('from "onboarding_daily"')
    expect(selected).not.toContain('from "daily"')
    expect(selected).not.toContain('from scan_ledger')
    const outcomes = query.sql.split('onboarding_flow_outcomes as materialized (')[1].split('), onboarding_summary as (')[0]
    expect(outcomes).toContain('o.actor = f.actor and o.flow_id = f.flow_id')
    expect(outcomes).toContain('o.occurred_at >= f.at')
    expect(outcomes).toContain("o.occurred_at <= f.at + interval '7 days'")
    expect(query.sql).toContain('as eligible_completed')
  })
  test('activity and billing share the exact rolling 24-hour window and hourly buckets', () => {
    const query = dialect.sqlToQuery(analyticsQuery({ days: '1', platform: 'ios' }, now))
    expect(query.params).toContain(start)
    expect(query.params).toContain(now.toISOString())
    expect(query.sql.match(/date_trunc\('hour',/g)).toHaveLength(7)
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
    expect(query.params.filter(value => value === 'America/Los_Angeles')).toHaveLength(9)
    expect(query.sql).toContain("date_trunc('day', occurred_at at time zone 'UTC',")
    expect(dialect.sqlToQuery(reliabilityQuery(7, now)).params).toContain('America/Los_Angeles')
  })
})
