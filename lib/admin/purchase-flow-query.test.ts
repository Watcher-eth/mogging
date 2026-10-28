import { expect,test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery } from './analytics'

const dialect=new PgDialect()
const now=new Date('2026-10-27T22:00:00Z')
test('purchase flow aggregates the full linked population and skips redundant reports', () => {
  const {sql,params}=dialect.sqlToQuery(analyticsQuery({days:'30',platform:'ios',section:'Purchases'},now))
  const selected=sql.split(') select json_build_object(').at(-1)!
  expect(selected).toContain('(select report from purchase_flow)')
  for(const legacy of ['from "paywall2"','from "paid_delivery"','from "daily"','from "event_metrics"']) expect(selected).not.toContain(legacy)
  const report=sql.split('purchase_flow_events as materialized (')[1].split('), "onboarding_events0"')[0]
  expect(report).not.toMatch(/limit\s+\d/i)
  expect(report).toContain('from e where platform in')
  expect(report).toContain('over(partition by actor,platform,properties')
  expect(report).toContain("bad.audience='sandbox'")
  expect(report).toContain('select transaction_id from sandbox_transactions')
  expect(report).toContain("coalesce(nullif(context->>'purchase_kind',''),'unknown')")
  expect(report).toContain('started is not null and occurred_at >= started')
  expect(params).toContain('ios')
  expect(params).toContain('2026-09-27T22:00:00.000Z')
})

test('exact billing matches and outcome precedence preserve cancellations, pending approval and access uncertainty', () => {
  const {sql}=dialect.sqlToQuery(analyticsQuery({days:'1',platform:'all',section:'Purchases'},now))
  expect(sql).toContain("b.transaction_id=a.properties->>'transaction_id'")
  expect(sql).toContain("b.product_id=a.properties->>'productId'")
  expect(sql).toContain("bool_or(b.environment='production')")
  expect(sql).toContain("b.event_name in ('subscription_started','trial_started','one_time_purchase')")
  expect(sql).toContain("when activated and purchased then 'activated'")
  expect(sql).toContain("when activated then 'activation_only'")
  expect(sql.indexOf('when purchased then case')).toBeLessThan(sql.indexOf("when terminal='purchase_cancelled'"))
  expect(sql).toContain("terminal_context->>'reason_code'='payment_pending'")
  expect(sql).toContain("interval '2 minutes'")
  expect(sql).toContain('count(*) filter(where purchased and activated)')
  expect(sql).toContain("date_trunc('hour', started)")
  const selected=sql.split('), purchase_flow as (')[1].split('), "onboarding_events0"')[0]
  expect(selected).not.toContain("'transaction_id',")
  expect(selected).not.toContain("'actor',")
  expect(selected).not.toContain("'attempt_id',")
})
