import {expect,test} from 'bun:test'
import {PgDialect} from 'drizzle-orm/pg-core'
import {analyticsQuery} from './analytics'
const dialect=new PgDialect()
const now=new Date('2026-10-27T22:00:00Z')

test('scans selects uncapped all-platform outcomes instead of duplicate client/report charts and delivery diagnostics',()=>{
  const query=dialect.sqlToQuery(analyticsQuery({days:'30',platform:'ios',section:'Scans'},now))
  const selected=query.sql.split(') select json_build_object(').at(-1)!
  expect(selected).toContain('(select report from scans)')
  for(const duplicate of ['from "daily"','from "event_metrics"','from report_ledger_daily','from scan_ledger_daily','from "paid_delivery"'])expect(selected).not.toContain(duplicate)
  expect(query.params).not.toContain('ios')
  expect(query.params).toContain('2026-09-27T22:00:00.000Z')
  const scans=query.sql.split('scan_activity as materialized (')[1].split('), "onboarding_events0"')[0]
  expect(scans).not.toMatch(/limit\s+\d/i)
  expect(scans).toContain('p.id not in (select id from excluded_entitlements)')
  expect(query.sql).toContain("'internal_release_verification'")
  expect(scans).toContain('r.user_id not in (select id from internal_accounts)')
  expect(scans).toContain("p.source='user'")
  expect(scans).toContain('a.id not in (select id from excluded_reports)')
  expect(scans).toContain("count(distinct nullif(report_id,'')) filter(where status='complete')")
})

test('scan timing uses valid successful request samples and keeps stale pending status separate',()=>{
  const query=dialect.sqlToQuery(analyticsQuery({days:'1',platform:'all',section:'Scans'},now)).sql
  expect(query).toContain("status='pending' and created_at <")
  expect(query).toContain("interval '5 minutes'")
  expect(query).toContain("jsonb_typeof(properties->'duration_ms')='number'")
  expect(query).toContain("(properties->>'duration_ms')::numeric >= 0")
  expect(query).toContain("count(duration_ms) filter(where event_name='evaluation_request_completed')")
  expect(query).toContain('percentile_cont(0.9)')
  expect(query).toContain("date_trunc('hour', created_at)")
  const serialized=query.split('), scans as (')[1].split('), "onboarding_events0"')[0]
  for(const privateField of ['user_id','report_id','failure_reason','image_url','landmarks'])expect(serialized).not.toContain(privateField)
})
