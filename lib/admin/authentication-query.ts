import { sql } from 'drizzle-orm'
import { customerAccount } from './audience'
import { trackingDefinitions } from './tracking'
import type { MetricRow } from './analytics'

export type AuthenticationReport = {
  summary: MetricRow[]; providers: MetricRow[]; failures: MetricRow[]; support: MetricRow[]; links: MetricRow[]
}

// e already applies the rolling period, platform and production customer exclusions.
export function authenticationCTEs(start: string, end: string, platform: string) {
  const events = trackingDefinitions.filter(row => row.section === 'Authentication').map(row => row.event)
  return sql`auth_events as materialized (
    select * from e where event_name in (${sql.join(events.map(event => sql`${event}`), sql`,`)})
  ), auth_summary as (
    select count(*) as events,
      count(*) filter(where event_name='account_auth_started') as starts,
      count(*) filter(where event_name='account_authenticated') as successes,
      count(distinct actor) filter(where event_name='account_authenticated') as authenticated_devices,
      count(*) filter(where event_name='account_auth_failed') as failures,
      count(*) filter(where event_name='account_auth_cancelled') as cancellations,
      count(*) filter(where event_name='account_post_login_failed') as setup_failures,
      count(*) filter(where event_name='account_auth_started' and nullif(properties->>'attempt_id','') is not null) as starts_with_attempt,
      count(*) filter(where event_name in ('account_auth_failed','account_auth_cancelled','account_post_login_failed') and nullif(properties->>'auth_stage','') is not null) as classified_issues,
      count(*) filter(where platform in ('ios','android') and coalesce(properties->>'runtime_environment','unknown')='unknown') as runtime_unconfirmed_events,
      max(occurred_at) as latest_event,max(received_at) as latest_receipt
    from auth_events
  ), auth_providers as (
    select coalesce(nullif(properties->>'provider',''),'unknown') as provider,
      count(*) filter(where event_name='account_auth_started') as starts,
      count(*) filter(where event_name='account_authenticated') as successes,
      count(*) filter(where event_name='account_auth_failed') as failures,
      count(*) filter(where event_name='account_auth_cancelled') as cancellations,
      count(*) filter(where event_name='account_post_login_failed') as setup_failures
    from auth_events where event_name in ('account_auth_started','account_authenticated','account_auth_failed','account_auth_cancelled','account_post_login_failed')
    group by 1 order by count(*) desc,1
  ), auth_failures as (
    select event_name as outcome,coalesce(nullif(properties->>'provider',''),'unknown') as provider,
      coalesce(nullif(properties->>'auth_stage',''),'unclassified') as stage,
      coalesce(nullif(properties->>'error_code',''),nullif(properties->>'reason_code',''),'unclassified') as reason,
      count(*) as events,count(distinct actor) as affected_devices
    from auth_events where event_name in ('account_auth_failed','account_post_login_failed')
    group by 1,2,3,4 order by count(*) desc,1,2,3,4
  ), auth_support as (
    select event_name,count(*) as events,count(distinct actor) as devices from auth_events
    where event_name not in ('account_auth_started','account_authenticated','account_auth_failed','account_auth_cancelled','account_post_login_failed','identity_linked')
    group by event_name order by event_name
  ), auth_link_records as materialized (
    select account_id,platform,linked_at from analytics_identity_links
    where linked_at >= ${start}::timestamp and linked_at < ${end}::timestamp
      and ${customerAccount(sql`account_id`)} and ${platform === 'all' ? sql`true` : sql`platform = ${platform}`}
  ), authentication as (
    select json_build_object(
      'summary',(select json_agg(r) from auth_summary r),
      'providers',coalesce((select json_agg(r) from auth_providers r),'[]'::json),
      'failures',coalesce((select json_agg(r) from auth_failures r),'[]'::json),
      'support',coalesce((select json_agg(r) from auth_support r),'[]'::json),
      'links',(select json_build_array(json_build_object('links',count(*),'accounts',count(distinct account_id),'latest_link',max(linked_at))) from auth_link_records)
    ) as report
  )`
}
