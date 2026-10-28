import { sql } from 'drizzle-orm'
import { customerAccount } from './audience'
import { reportingBucket } from './reporting-bucket'
import { trackingDefinitions } from './tracking'
import type { MetricRow } from './analytics'

export type PurchaseFlowReport = {
  summary: MetricRow[]; daily: MetricRow[]; outcomes: MetricRow[]; surfaces: MetricRow[];
  failures: MetricRow[]; feedback: MetricRow[]; support: MetricRow[]; coverage: MetricRow[]; handoffs: MetricRow[]
}

// Full-window aggregates, independent of the capped, authenticated timeline endpoint.
// The parent e snapshot already applies platform, customer and runtime exclusions.
export function purchaseFlowCTEs(start: string, end: string, days: number) {
  const events = trackingDefinitions.filter(row => row.section === 'Purchases').map(row => row.event)
  return sql`purchase_flow_events as materialized (
    select * from e where platform in ('ios','android') and event_name in (${sql.join(events.map(event => sql`${event}`), sql`,`)})
  ), purchase_flow_attempt_events as materialized (
    select * from (
      select actor,platform,properties->>'attempt_id' as attempt_id,
        min(occurred_at) filter(where event_name='purchase_started') over(partition by actor,platform,properties->>'attempt_id') as started,
        event_name,occurred_at,received_at,properties
      from purchase_flow_events a where actor is not null and nullif(properties->>'attempt_id','') is not null
        and not exists(select 1 from scoped_events bad where (bad.audience='sandbox' or bad.properties->>'transaction_id' in (select transaction_id from sandbox_transactions))
          and bad.platform=a.platform and bad.actor=a.actor and bad.properties->>'attempt_id'=a.properties->>'attempt_id')
    ) linked where started is not null and occurred_at >= started
  ), purchase_flow_matches as (
    select a.actor,a.platform,a.attempt_id,bool_or(b.environment='production') as verified,
      max(b.received_at) filter(where b.environment='production') as latest_billing_receipt
    from purchase_flow_attempt_events a join subscription_events b
      on b.provider='revenuecat' and b.environment='production' and b.transaction_id=a.properties->>'transaction_id'
      and b.product_id=a.properties->>'productId'
      and b.event_name in ('subscription_started','trial_started','one_time_purchase')
      and b.occurred_at >= a.started - interval '5 seconds' and b.occurred_at < ${end}::timestamp
      and b.received_at < ${end}::timestamp and ${customerAccount(sql`coalesce(b.account_id,b.external_user_id)`)}
    group by a.actor,a.platform,a.attempt_id
  ), purchase_flow_flags as (
    select a.actor,a.platform,a.attempt_id,a.started,
      (array_agg(a.properties order by occurred_at,received_at) filter(where event_name='purchase_started'))[1] as context,
      bool_or(event_name='checkout_started') as requested,
      bool_or(event_name='purchase_completed' or (event_name='purchase_reconciled' and properties->>'result' in ('provider_purchase_observed','activated'))) or coalesce(m.verified,false) as purchased,
      bool_or(event_name='purchase_activated' or (event_name='purchase_reconciled' and properties->>'result'='activated')) as activated,
      coalesce(m.verified,false) as verified,m.latest_billing_receipt,
      (array_agg(event_name order by occurred_at desc,received_at desc) filter(where event_name in ('purchase_cancelled','purchase_failed','purchase_pending','purchase_activation_failed','purchase_account_required')))[1] as terminal,
      (array_agg(properties order by occurred_at desc,received_at desc) filter(where event_name in ('purchase_cancelled','purchase_failed','purchase_pending','purchase_activation_failed','purchase_account_required')))[1] as terminal_context,
      (array_agg(properties->>'feedback_reason' order by occurred_at desc,received_at desc) filter(where event_name='purchase_cancel_feedback'))[1] as feedback
    from purchase_flow_attempt_events a left join purchase_flow_matches m using(actor,platform,attempt_id)
    group by a.actor,a.platform,a.attempt_id,a.started,m.verified,m.latest_billing_receipt
  ), purchase_flow_attempts as materialized (
    select *,case
      when activated and purchased then 'activated'
      when activated then 'activation_only'
      when purchased then case when terminal='purchase_activation_failed' then 'purchased_access_failed' when terminal='purchase_account_required' then 'account_required' else 'purchased_access_pending' end
      when terminal='purchase_pending' or terminal_context->>'reason_code'='payment_pending' then 'pending'
      when terminal='purchase_cancelled' then 'cancelled'
      when terminal='purchase_failed' then case when terminal_context->>'purchase_stage'='store_purchase' then 'store_failed' else 'preparation_failed' end
      when started > ${end}::timestamp - interval '2 minutes' then 'in_progress'
      else 'unresolved' end as outcome
    from purchase_flow_flags
  ), purchase_flow_summary as (
    select count(*) as attempts,count(distinct actor) as devices,
      count(*) filter(where requested) as requested,count(*) filter(where purchased) as purchased,
      count(*) filter(where verified) as verified,count(*) filter(where purchased and activated) as activated,
      count(*) filter(where outcome='cancelled') as cancellations,
      count(*) filter(where outcome in ('preparation_failed','store_failed','purchased_access_failed')) as errors,
      count(*) filter(where outcome in ('purchased_access_failed','purchased_access_pending','account_required')) as access_unconfirmed,
      count(*) filter(where outcome in ('pending','in_progress','unresolved')) as incomplete
    from purchase_flow_attempts
  ), purchase_flow_daily as (
    select ${reportingBucket(sql`started`, days)} as day,count(*) as attempts,
      count(*) filter(where purchased) as purchased,count(*) filter(where purchased and activated) as activated
    from purchase_flow_attempts group by 1 order by 1
  ), purchase_flow_outcomes as (
    select outcome,count(*) as attempts,count(distinct actor) as devices from purchase_flow_attempts group by outcome order by count(*) desc,outcome
  ), purchase_flow_surfaces as (
    select coalesce(nullif(context->>'surface',''),'unknown') as surface,
      coalesce(nullif(context->>'purchase_kind',''),'unknown') as purchase_type,platform,
      count(*) as attempts,count(*) filter(where purchased) as purchased,
      count(*) filter(where purchased and activated) as activated,count(*) filter(where verified) as verified,
      count(*) filter(where outcome='cancelled') as cancellations
    from purchase_flow_attempts group by 1,2,3 order by count(*) desc,1,2,3
  ), purchase_flow_failures as (
    select outcome,coalesce(nullif(terminal_context->>'purchase_stage',''),'unknown') as stage,
      coalesce(nullif(terminal_context->>'reason_code',''),'unknown') as reason,
      coalesce(nullif(terminal_context->>'error_code',''),'unknown') as error_code,
      count(*) as attempts,count(distinct actor) as affected_devices
    from purchase_flow_attempts where outcome in ('preparation_failed','store_failed','purchased_access_failed')
    group by 1,2,3,4 order by count(*) desc,1,2,3,4
  ), purchase_flow_feedback as (
    select feedback as reason,count(*) as responses from purchase_flow_attempts where feedback is not null group by feedback order by count(*) desc,feedback
  ), purchase_flow_support as (
    select event_name,count(*) as events,count(distinct actor) as devices from purchase_flow_events
    where event_name in ('restore_started','restore_failed','purchase_restored','activation_code_redeemed') group by event_name order by event_name
  ), purchase_flow_coverage as (
    select count(*) filter(where event_name='purchase_started') as start_events,
      count(*) filter(where event_name='purchase_started' and (nullif(properties->>'attempt_id','') is null or actor is null)) as unlinked_starts,
      count(*) filter(where event_name='purchase_started' and properties->>'purchase_tracking_version'='2') as detailed_starts,
      count(*) filter(where event_name='paywall_viewed') as paywall_views,
      count(distinct actor) filter(where event_name='paywall_viewed') as paywall_devices,
      count(*) filter(where coalesce(properties->>'runtime_environment','unknown')='unknown') as runtime_unconfirmed_events,
      max(occurred_at) as latest_event,max(received_at) as latest_receipt,
      (select max(latest_billing_receipt) from purchase_flow_matches) as latest_billing_receipt
    from purchase_flow_events
  ), purchase_flow_handoffs as (
    select case when consumed_at < ${end}::timestamp then 'consumed' when expires_at <= ${end}::timestamp then 'expired' else 'awaiting' end as status,
      count(*) as handoffs,count(distinct user_id) as accounts
    from payment_handoffs where created_at >= ${start}::timestamp and created_at < ${end}::timestamp
      and ${customerAccount(sql`user_id`)}
    group by 1 order by 1
  ), purchase_flow as (
    select json_build_object(
      'summary',(select json_agg(r) from purchase_flow_summary r),
      'daily',coalesce((select json_agg(r) from purchase_flow_daily r),'[]'::json),
      'outcomes',coalesce((select json_agg(r) from purchase_flow_outcomes r),'[]'::json),
      'surfaces',coalesce((select json_agg(r) from purchase_flow_surfaces r),'[]'::json),
      'failures',coalesce((select json_agg(r) from purchase_flow_failures r),'[]'::json),
      'feedback',coalesce((select json_agg(r) from purchase_flow_feedback r),'[]'::json),
      'support',coalesce((select json_agg(r) from purchase_flow_support r),'[]'::json),
      'coverage',(select json_agg(r) from purchase_flow_coverage r),
      'handoffs',coalesce((select json_agg(r) from purchase_flow_handoffs r),'[]'::json)
    ) as report
  )`
}
