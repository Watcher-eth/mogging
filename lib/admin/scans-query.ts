import { sql } from 'drizzle-orm'
import { customerAccount } from './audience'
import { reportingBucket } from './reporting-bucket'
import type { MetricRow } from './analytics'

export type ScansReport = {
  summary: MetricRow[]; daily: MetricRow[]; sources: MetricRow[]; reports: MetricRow[];
  client: MetricRow[]; failures: MetricRow[]; releases: MetricRow[]; events: MetricRow[]
}

// Backend request/report records have no reliable platform field. Their reporting
// scope is always all platforms, including free and subscription access.
export function scansCTEs(start: string, end: string, days: number) {
  return sql`scan_activity as materialized (
    select r.status,r.created_at,r.user_id,r.result->'analysis'->>'id' as report_id,
      coalesce(nullif(p.source,''),'unknown') as source
    from scan_reservations r join payment_entitlements p on p.id=r.entitlement_id
    where r.created_at >= ${start}::timestamp and r.created_at < ${end}::timestamp
      and p.id not in (select id from excluded_entitlements) and ${customerAccount(sql`r.user_id`)}
  ), scans_summary as (
    select count(*) as requests,count(distinct user_id) as accounts,
      count(*) filter(where status='complete') as completed,
      count(*) filter(where status='failed') as failed,
      count(*) filter(where status='pending') as pending,
      count(*) filter(where status not in ('complete','failed','pending')) as other,
      count(*) filter(where status='pending' and created_at < ${end}::timestamp - interval '5 minutes') as pending_over_five_minutes,
      min(created_at) filter(where status='pending') as oldest_pending,
      count(distinct nullif(report_id,'')) filter(where status='complete') as distinct_reports,
      count(*) filter(where status='complete' and nullif(report_id,'') is null) as missing_report_reference,
      max(created_at) as latest_request
    from scan_activity
  ), scans_daily as (
    select ${reportingBucket(sql`created_at`,days)} as day,
      count(*) as requests,count(*) filter(where status='complete') as completed,
      count(*) filter(where status='failed') as failed,count(*) filter(where status='pending') as pending
    from scan_activity group by 1 order by 1
  ), scans_sources as (
    select source,count(*) as requests,count(*) filter(where status='complete') as completed,
      count(*) filter(where status='failed') as failed,count(*) filter(where status='pending') as pending
    from scan_activity group by source order by count(*) desc,source
  ), scans_reports as (
    select count(*) filter(where a.status='complete') as completed,
      count(*) filter(where a.status='failed') as failed,count(*) filter(where a.status not in ('complete','failed')) as other,
      max(a.created_at) as latest_created,max(a.updated_at) as latest_updated
    from analyses a join photos p on p.id=a.photo_id
    where p.source='user' and ${customerAccount(sql`p.user_id`)} and a.id not in (select id from excluded_reports)
      and a.created_at >= ${start}::timestamp and a.created_at < ${end}::timestamp
  ), scans_client_events as materialized (
    select *,case when jsonb_typeof(properties->'duration_ms')='number' then
      case when (properties->>'duration_ms')::numeric >= 0 then (properties->>'duration_ms')::numeric end end as duration_ms
    from e where event_name in ('evaluation_started','evaluation_completed','evaluation_failed','evaluation_request_started','evaluation_request_completed','evaluation_request_failed')
  ), scans_client as (
    select count(*) filter(where event_name='evaluation_started') as evaluation_starts,
      count(*) filter(where event_name='evaluation_completed') as evaluation_completions,
      count(*) filter(where event_name='evaluation_failed') as evaluation_failures,
      count(duration_ms) filter(where event_name='evaluation_completed') as timed_evaluations,
      round((percentile_cont(0.5) within group(order by duration_ms) filter(where event_name='evaluation_completed'))::numeric) as evaluation_median_ms,
      round((percentile_cont(0.9) within group(order by duration_ms) filter(where event_name='evaluation_completed'))::numeric) as evaluation_p90_ms,
      count(*) filter(where event_name='evaluation_request_started') as request_starts,
      count(*) filter(where event_name='evaluation_request_completed') as request_completions,
      count(*) filter(where event_name='evaluation_request_failed') as request_failures,
      count(duration_ms) filter(where event_name='evaluation_request_completed') as timed_completions,
      round((percentile_cont(0.5) within group(order by duration_ms) filter(where event_name='evaluation_request_completed'))::numeric) as median_ms,
      round((percentile_cont(0.9) within group(order by duration_ms) filter(where event_name='evaluation_request_completed'))::numeric) as p90_ms,
      count(*) filter(where event_name='evaluation_request_started' and nullif(properties->>'request_id','') is null) as requests_without_id,
      count(*) filter(where platform in ('ios','android') and coalesce(properties->>'runtime_environment','unknown')='unknown') as runtime_unconfirmed_events,
      max(occurred_at) as latest_event,max(received_at) as latest_receipt
    from scans_client_events
  ), scans_failures as (
    select event_name,platform,coalesce(nullif(properties->>'reason_code',''),'unknown') as reason,
      count(*) as events,count(distinct actor) as affected_devices
    from scans_client_events where event_name in ('evaluation_failed','evaluation_request_failed')
    group by 1,2,3 order by count(*) desc,1,2,3
  ), scans_releases as (
    select platform,coalesce(app_version,'unknown') as release,
      count(*) filter(where event_name='evaluation_request_started') as starts,
      count(*) filter(where event_name='evaluation_request_completed') as completions,
      count(*) filter(where event_name='evaluation_request_failed') as failures,
      count(duration_ms) filter(where event_name='evaluation_request_completed') as timed_completions,
      round((percentile_cont(0.5) within group(order by duration_ms) filter(where event_name='evaluation_request_completed'))::numeric) as median_ms
    from scans_client_events where event_name like 'evaluation_request_%'
    group by 1,2 order by count(*) desc,1,2
  ), scans_events as (
    select event_name,count(*) as events,count(distinct actor) as devices
    from scans_client_events group by event_name order by event_name
  ), scans as (
    select json_build_object(
      'summary',(select json_agg(r) from scans_summary r),
      'daily',coalesce((select json_agg(r) from scans_daily r),'[]'::json),
      'sources',coalesce((select json_agg(r) from scans_sources r),'[]'::json),
      'reports',(select json_agg(r) from scans_reports r),
      'client',(select json_agg(r) from scans_client r),
      'failures',coalesce((select json_agg(r) from scans_failures r),'[]'::json),
      'releases',coalesce((select json_agg(r) from scans_releases r),'[]'::json),
      'events',coalesce((select json_agg(r) from scans_events r),'[]'::json)
    ) as report
  )`
}
