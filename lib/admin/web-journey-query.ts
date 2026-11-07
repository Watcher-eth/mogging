import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { audienceCTEs, customerEvent } from './audience'
import { reportingBucket } from './reporting-bucket'
import { WEB_FLOW_VERSION, webJourneyDimensions } from '@/lib/analytics/web-context'
import type { MetricRow } from './analytics'

export { webJourneyDimensions } from '@/lib/analytics/web-context'
export type WebJourneyDimension = typeof webJourneyDimensions[number]
export type WebJourneyReport = { version: string; dimension: string; summary: MetricRow[]; funnel: MetricRow[]; daily: MetricRow[]; segments: MetricRow[]; steps: MetricRow[]; issues: MetricRow[]; catalog: MetricRow[]; versions: MetricRow[]; coverage: MetricRow[]; journeys: MetricRow[]; outcomes: MetricRow[]; postPurchase: MetricRow[] }

// The parent e applies the shared production/customer/internal-account policy.
// Billing and access are joined by exact checkout IDs. Account activity is never
// silently reassigned to a journey using a nearby timestamp.
export function webJourneyCTEs(start: string, end: string, days: number, version = WEB_FLOW_VERSION, dimension: WebJourneyDimension = 'browser') {
  const segment = sql.identifier(dimension)
  return sql`wj_events as materialized (
    select * from e where platform in ('web','server')
      and nullif(properties->>'flow_id','') is not null
  ), wj_flows as materialized (
    select properties->>'flow_id' as flow_id,
      min(occurred_at) filter(where platform='web' and (properties->>'path' in ('/','/analysis') or (event_name='paywall_viewed' and properties->>'surface' in ('web_analysis','landing','scan_app_credits')))) as started,
      coalesce((array_agg(properties->>'flow_version' order by occurred_at) filter(where nullif(properties->>'flow_version','') is not null))[1],'legacy') as version,
      coalesce((array_agg(properties->>'browser_family' order by occurred_at) filter(where properties->>'browser_family' is not null))[1],'unknown') as browser,
      coalesce((array_agg(properties->>'device_platform' order by occurred_at) filter(where properties->>'device_platform' is not null))[1],'unknown') as device,
      coalesce((array_agg(properties->>'country' order by occurred_at) filter(where properties->>'country' is not null))[1],'unknown') as country,
      coalesce((array_agg(coalesce(properties->>'first_utm_source',properties->>'utm_source',properties->>'referrer_host') order by occurred_at) filter(where coalesce(properties->>'first_utm_source',properties->>'utm_source',properties->>'referrer_host') is not null))[1],'direct / unknown') as source,
      coalesce((array_agg(coalesce(properties->>'first_utm_campaign',properties->>'utm_campaign') order by occurred_at) filter(where coalesce(properties->>'first_utm_campaign',properties->>'utm_campaign') is not null))[1],'unattributed') as campaign,
      coalesce((array_agg(coalesce(properties->>'creator_tracking_link_id',properties->>'creator_first_tracking_link_id') order by occurred_at) filter(where coalesce(properties->>'creator_tracking_link_id',properties->>'creator_first_tracking_link_id') is not null))[1],'unattributed') as creator,
      coalesce((array_agg(properties->>'entry_mode' order by occurred_at) filter(where properties->>'entry_mode' is not null))[1],(array_agg(properties->>'surface' order by occurred_at) filter(where event_name='paywall_viewed' and properties->>'surface' is not null))[1],'unknown') as entry,
      coalesce((array_agg(coalesce(properties->>'product',properties->>'plan') order by occurred_at desc) filter(where event_name in ('checkout_started','plan_selected') and coalesce(properties->>'product',properties->>'plan') is not null))[1],'not selected') as plan,
      coalesce((array_agg(concat_ws(' / ',properties->>'experiment_id',properties->>'variant') order by occurred_at) filter(where properties->>'experiment_id' is not null))[1],'unassigned') as experiment,
      min(occurred_at) filter(where event_name='paywall_viewed') as paywall_at,
      min(occurred_at) filter(where event_name='purchase_started' or (event_name='onboarding_interaction' and properties->>'action'='checkout_tapped')) as tapped_at,
      min(occurred_at) filter(where event_name='photo_selected' or (event_name='face_capture_result' and properties->>'result'='captured')) as photo_at,
      min(occurred_at) filter(where event_name='report_viewed') as report_at,
      max(occurred_at) filter(where platform='server' and event_name='evaluation_request_completed' and source='web_analysis') as evaluated_at,
      bool_or(event_name='purchase_reconciled' and properties->>'result'='existing_access') as existing_access
    from wj_events group by 1
  ), wj_cohort as materialized (
    select * from wj_flows where started >= ${start}::timestamp and started < ${end}::timestamp and version=${version}
  ), wj_checkouts as materialized (
    select a.session_id as checkout_id,a.properties->>'flow_id' as flow_id,a.properties->>'attempt_id' as attempt_id,
      min(a.account_id) as account_id,min(a.occurred_at) as created_at
    from wj_events a join wj_cohort c on c.flow_id=a.properties->>'flow_id'
    where a.platform='server' and a.event_name='checkout_started' and a.session_id like 'cs_%'
    group by 1,2,3
  ), wj_receipts as materialized (
    select s.checkout_id,s.flow_id,s.attempt_id,s.account_id,s.created_at,
      min(b.occurred_at) filter(where b.event_name in ('checkout_confirmed','one_time_purchase')) as paid_at,
      bool_or(b.event_name='checkout_confirmed') as subscription,
      bool_or(b.event_name='checkout_expired') as expired,
      bool_or(p.id is not null) as access_granted
    from wj_checkouts s left join subscription_events b on b.provider='stripe' and b.environment='production'
      and b.properties->>'checkout_session_id'=s.checkout_id and b.received_at < ${end}::timestamp
    left join payment_entitlements p on p.stripe_checkout_session_id=s.checkout_id and p.created_at < ${end}::timestamp
    group by s.checkout_id,s.flow_id,s.attempt_id,s.account_id,s.created_at
  ), wj_states as materialized (
    select c.*,r.checkout_at,r.paid_at,r.subscription,r.paid_sessions,r.granted,
      exists(select 1 from wj_events ev join wj_events viewed on viewed.properties->>'flow_id'=ev.properties->>'flow_id'
        and viewed.properties->>'report_id'=ev.properties->>'report_id' and viewed.event_name='report_viewed' and viewed.platform='web'
        where ev.platform='server' and ev.event_name='evaluation_request_completed' and ev.source='web_analysis'
          and ev.properties->>'flow_id'=c.flow_id and ev.occurred_at >= r.paid_at) as paid_report_viewed,
      c.paywall_at is not null as saw_paywall,
      c.paywall_at is not null and c.tapped_at >= c.paywall_at as tapped,
      c.paywall_at is not null and c.tapped_at >= c.paywall_at and r.checkout_at is not null as checkout,
      c.paywall_at is not null and c.tapped_at >= c.paywall_at and r.checkout_at is not null and r.paid_at is not null as paid,
      case when r.paid_at is not null and c.evaluated_at >= r.paid_at then true else false end as paid_evaluation
    from wj_cohort c left join lateral (
      select min(created_at) as checkout_at,min(paid_at) as paid_at,bool_or(subscription) filter(where paid_at is not null) as subscription,
        count(*) filter(where paid_at is not null) as paid_sessions,bool_or(access_granted) filter(where paid_at is not null) as granted
      from wj_receipts r where r.flow_id=c.flow_id
    ) r on true
  ), wj_summary as (
    select count(*) as journeys,count(*) filter(where photo_at is not null) as photo_ready,
      count(*) filter(where saw_paywall) as paywalls,count(*) filter(where tapped) as checkout_taps,
      count(*) filter(where checkout) as checkouts,count(*) filter(where paid) as paid_journeys,
      count(*) filter(where paid and subscription) as subscription_journeys,
      count(*) filter(where paid and not subscription) as report_purchase_journeys,
      count(*) filter(where paid and granted) as access_granted,
      count(*) filter(where paid and paid_evaluation) as evaluated,
      count(*) filter(where paid and paid_evaluation and paid_report_viewed) as report_viewed,
      count(*) filter(where existing_access) as existing_access_journeys,
      count(*) filter(where evaluated_at is not null) as all_server_evaluated,
      coalesce(sum(paid_sessions),0) as verified_paid_sessions,
      count(*) filter(where paid_at is not null and not paid) as paid_without_ordered_browser_path
    from wj_states
  ), wj_daily as (
    select ${reportingBucket(sql`started`, days)} as day,count(*) as journeys,count(*) filter(where saw_paywall) as paywalls,
      count(*) filter(where paid) as paid,count(*) filter(where paid and paid_evaluation) as evaluated
    from wj_states group by 1 order by 1
  ), wj_segments as (
    select ${segment} as segment,count(*) as journeys,count(*) filter(where saw_paywall) as paywalls,
      count(*) filter(where tapped) as checkout_taps,count(*) filter(where checkout) as checkouts,
      count(*) filter(where paid) as paid,count(*) filter(where paid and subscription) as subscriptions,
      count(*) filter(where paid and paid_evaluation) as evaluated
    from wj_states group by 1 order by journeys desc limit 50
  ), wj_steps as (
    select a.properties->>'step' as step,count(distinct c.flow_id) filter(where event_name='onboarding_step_viewed') as viewed,
      count(distinct c.flow_id) filter(where event_name='onboarding_step_completed') as completed,
      round((percentile_cont(.5) within group(order by case when a.properties->>'duration_ms' ~ '^[0-9]{1,9}$' then (a.properties->>'duration_ms')::numeric end) filter(where event_name='onboarding_step_exited'))::numeric) as median_ms
    from wj_events a join wj_cohort c on c.flow_id=a.properties->>'flow_id'
    where a.event_name in ('onboarding_step_viewed','onboarding_step_completed','onboarding_step_exited') and a.properties->>'step' like 'profile.%'
    group by 1 order by viewed desc,step
  ), wj_issues as (
    select event_name,coalesce(a.properties->>'purchase_stage',a.properties->>'step',a.properties->>'mode','unknown') as stage,
      coalesce(a.properties->>'reason_code',a.properties->>'result','unknown') as reason,count(*) as events,count(distinct c.flow_id) as journeys
    from wj_events a join wj_cohort c on c.flow_id=a.properties->>'flow_id'
    where a.event_name in ('purchase_failed','purchase_activation_failed','evaluation_request_failed','photo_validation_failed')
      or (a.event_name='paywall_products_loaded' and a.properties->>'products_loaded'='false')
      or (a.event_name='permission_result' and a.properties->>'result'='failed')
    group by 1,2,3 order by journeys desc
  ), wj_catalog as (
    select coalesce(a.properties->>'mode','unknown') as mode,
      case when a.properties->>'products_loaded'='true' then 'loaded' when a.properties->>'products_loaded'='false' then 'failed' else 'unconfirmed' end as result,
      count(*) as loads,count(distinct c.flow_id) as journeys,
      round((percentile_cont(.5) within group(order by case when a.properties->>'duration_ms' ~ '^[0-9]{1,9}$' then (a.properties->>'duration_ms')::numeric end))::numeric) as median_ms
    from wj_events a join wj_cohort c on c.flow_id=a.properties->>'flow_id' where a.event_name='paywall_products_loaded' group by 1,2
  ), wj_attempts as (
    select a.properties->>'attempt_id' as attempt_id,c.flow_id,
      bool_or(r.paid_at is not null) as paid,bool_or(r.expired) as expired,
      bool_or(a.event_name='purchase_cancelled') as cancelled,
      bool_or(a.event_name='purchase_failed') as failed,
      bool_or(a.event_name='purchase_reconciled' and a.properties->>'result'='existing_access') as existing_access,
      bool_or(r.checkout_id is not null) as created
    from wj_events a join wj_cohort c on c.flow_id=a.properties->>'flow_id'
    left join wj_receipts r on r.flow_id=c.flow_id and r.attempt_id=a.properties->>'attempt_id'
    where nullif(a.properties->>'attempt_id','') is not null and a.properties->>'attempt_id' in
      (select properties->>'attempt_id' from wj_events where event_name='purchase_started' and platform='web')
    group by 1,2
  ), wj_outcomes as (
    select case when paid then 'Stripe payment verified' when existing_access then 'Existing access used'
      when expired then 'Stripe checkout expired' when cancelled then 'Returned from cancelled checkout'
      when failed then 'Preparation or checkout error' when created then 'Checkout created · outcome unconfirmed'
      else 'Interrupted before checkout · outcome unconfirmed' end as outcome,count(*) as attempts
    from wj_attempts group by 1
  ), wj_paid_accounts as (
    select account_id,min(paid_at) as paid_at from wj_receipts where paid_at is not null and account_id is not null group by 1
  ), wj_post_purchase as (
    select count(*) as paid_accounts,
      count(*) filter(where exists(select 1 from scan_reservations r where r.user_id=p.account_id and r.status='complete' and r.created_at>=p.paid_at and r.created_at<${end}::timestamp)) as accounts_evaluated,
      count(*) filter(where p.paid_at<=${end}::timestamp-interval '2 days') as d1_eligible,
      count(*) filter(where p.paid_at<=${end}::timestamp-interval '8 days') as d7_eligible,
      count(*) filter(where p.paid_at<=${end}::timestamp-interval '2 days' and exists(select 1 from e a
        where a.platform='web' and a.account_id=p.account_id and a.occurred_at>=p.paid_at+interval '1 day' and a.occurred_at<p.paid_at+interval '2 days'
          and ((a.event_name='page_viewed' and a.properties->>'path' ~ '^/(app/home|analysis|progress|protocol|r/[^/]+)$')
            or a.event_name in ('report_viewed','protocol_viewed','progress_viewed','course_viewed') or (a.event_name='screen_viewed' and a.properties->>'surface'='scan_app')))) as d1_returned,
      count(*) filter(where p.paid_at<=${end}::timestamp-interval '8 days' and exists(select 1 from e a
        where a.platform='web' and a.account_id=p.account_id and a.occurred_at>=p.paid_at+interval '7 days' and a.occurred_at<p.paid_at+interval '8 days'
          and ((a.event_name='page_viewed' and a.properties->>'path' ~ '^/(app/home|analysis|progress|protocol|r/[^/]+)$')
            or a.event_name in ('report_viewed','protocol_viewed','progress_viewed','course_viewed') or (a.event_name='screen_viewed' and a.properties->>'surface'='scan_app')))) as d7_returned
    from wj_paid_accounts p
  ), wj_coverage as (
    select count(*) as web_analysis_events,count(*) filter(where nullif(properties->>'flow_id','') is null) as missing_flow,
      count(*) filter(where properties->>'flow_version' is null) as unversioned,
      max(occurred_at) as latest_event
    from e where platform='web' and (properties->>'path'='/analysis' or properties->>'surface'='web_analysis')
  ), wj_versions as (
    select version,count(*) as journeys from wj_flows where started is not null group by 1 order by journeys desc
  ), web_journey as (
    select json_build_object('version',${version}::text,'dimension',${dimension}::text,
      'summary',(select json_agg(r) from wj_summary r),
      'funnel',(select json_build_array(
        json_build_object('step','Site / flow entered','journeys',journeys),json_build_object('step','Paywall viewed','journeys',paywalls),
        json_build_object('step','Checkout tapped','journeys',checkout_taps),json_build_object('step','Stripe checkout created','journeys',checkouts),
        json_build_object('step','Payment verified','journeys',paid_journeys),json_build_object('step','Entitlement created','journeys',access_granted),
        json_build_object('step','Evaluation completed on server','journeys',evaluated),json_build_object('step','Report viewed','journeys',report_viewed)) from wj_summary),
      'daily',coalesce((select json_agg(r)from wj_daily r),'[]'::json),'segments',coalesce((select json_agg(r)from wj_segments r),'[]'::json),
      'steps',coalesce((select json_agg(r)from wj_steps r),'[]'::json),'issues',coalesce((select json_agg(r)from wj_issues r),'[]'::json),
      'catalog',coalesce((select json_agg(r)from wj_catalog r),'[]'::json),'coverage',(select json_agg(r)from wj_coverage r),
      'versions',coalesce((select json_agg(r)from wj_versions r),'[]'::json),
      'outcomes',coalesce((select json_agg(r)from wj_outcomes r),'[]'::json),'postPurchase',(select json_agg(r)from wj_post_purchase r),
      'journeys',coalesce((select json_agg(r)from(select flow_id,to_char(started,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started,browser,device,entry,plan,
        case when paid_evaluation then 'evaluation_completed' when paid_at is not null then 'payment_verified' when checkout then 'checkout_created' when tapped then 'checkout_tapped' when saw_paywall then 'paywall_viewed' else 'onboarding' end as latest_milestone
        from wj_states order by started desc limit 40)r),'[]'::json)
    ) as report
  )`
}

export async function getWebJourneyDetail(flowId: string) {
  const rows = await db.transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout='8s'`)
    return tx.execute(sql`with ${audienceCTEs()} select event_name,platform,source,
      to_char(occurred_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
      properties->>'step' as step,properties->>'action' as action,properties->>'purchase_stage' as stage,
      coalesce(properties->>'product',properties->>'plan') as product,properties->>'reason_code' as reason,
      properties->>'result' as result,properties->>'duration_ms' as duration_ms,
      properties->>'attempt_id' as attempt_id,properties->>'request_id' as request_id
      from analytics_events a where ${customerEvent('a')} and a.properties->>'flow_id'=${flowId}
        and a.occurred_at>=now()-interval '90 days' and a.platform in ('web','server')
      order by occurred_at,received_at limit 301`)
  })
  return { events: rows.slice(0,300) as MetricRow[], truncated: rows.length > 300 }
}
