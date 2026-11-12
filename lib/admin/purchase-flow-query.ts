import { sql } from 'drizzle-orm'
import { customerAccount } from './audience'
import { reportingBucket } from './reporting-bucket'
import { trackingDefinitions } from './tracking'
import type { MetricRow } from './analytics'

export type PurchaseFlowReport = {
  summary: MetricRow[]; daily: MetricRow[]; outcomes: MetricRow[]; surfaces: MetricRow[];
  failures: MetricRow[]; feedback: MetricRow[]; support: MetricRow[]; coverage: MetricRow[]; handoffs: MetricRow[]; catalog?: MetricRow[]; interruptions?: MetricRow[]; builds?: MetricRow[]; stripeActivity?: MetricRow[]
}

// Provider recovery requires one account/product/time-matched store request across all attempts,
// including attempts outside the selected window. Silence never becomes a cancellation.
// Full-window aggregates, independent of the capped, authenticated timeline endpoint.
// The parent e snapshot already applies platform, customer and runtime exclusions.
export function purchaseFlowCTEs(start: string, end: string, days: number) {
  const events = trackingDefinitions.filter(row => row.section === 'Purchases').map(row => row.event)
  return sql`purchase_flow_events as materialized (
    select * from e where platform in ('ios','android') and event_name in (${sql.join(events.map(event => sql`${event}`), sql`,`)})
  ), purchase_flow_attempt_events as materialized (
    select * from (
      select actor,platform,properties->>'attempt_id' as attempt_id,
        account_id,app_version,min(occurred_at) filter(where event_name='purchase_started') over(partition by actor,platform,properties->>'attempt_id') as started,
        event_name,occurred_at,received_at,properties
      from purchase_flow_events a where actor is not null and nullif(properties->>'attempt_id','') is not null
        and not exists(select 1 from scoped_events bad where (bad.audience='sandbox' or bad.properties->>'transaction_id' in (select transaction_id from sandbox_transactions))
          and bad.platform=a.platform and bad.actor=a.actor and bad.properties->>'attempt_id'=a.properties->>'attempt_id')
    ) linked where started is not null and occurred_at >= started
  ), purchase_flow_matches as (
    select a.actor,a.platform,a.attempt_id,bool_or(b.environment='production') as verified,
      bool_and(b.occurred_at<a.started-interval '5 seconds') as existing_purchase,
      max(b.received_at) filter(where b.environment='production') as latest_billing_receipt
    from purchase_flow_attempt_events a join subscription_events b
      on b.provider='revenuecat' and b.environment='production' and b.product_id=a.properties->>'productId'
      and (b.transaction_id=a.properties->>'transaction_id' or (
        a.event_name='checkout_started' and a.account_id is not null and b.account_id=a.account_id
        and ((a.platform='ios' and b.properties->>'store'='APP_STORE') or (a.platform='android' and b.properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY')))
        and b.transaction_id is not null
        and b.occurred_at>=a.occurred_at-interval '5 seconds' and b.occurred_at<=a.occurred_at+interval '10 minutes'
        and (select count(distinct (coalesce(other.mobile_install_id,other.anonymous_id,other.account_id),other.platform,other.properties->>'attempt_id'))
          from analytics_events other where other.account_id=a.account_id and other.event_name='checkout_started'
            and other.environment='production' and other.platform in ('ios','android')
            and nullif(other.properties->>'attempt_id','') is not null and other.properties->>'productId'=b.product_id
            and coalesce(other.properties->>'runtime_environment','unknown') not in ('sandbox','development','test')
            and coalesce(other.properties->>'store_environment','unknown')<>'sandbox'
            and other.occurred_at>=b.occurred_at-interval '10 minutes' and other.occurred_at<=b.occurred_at+interval '5 seconds')=1
        and not exists(select 1 from purchase_flow_attempt_events known where known.actor=a.actor and known.platform=a.platform
          and known.attempt_id=a.attempt_id and known.event_name='purchase_completed'
          and nullif(known.properties->>'transaction_id','') is not null and known.properties->>'transaction_id'<>b.transaction_id)
      ))
      and b.event_name in ('subscription_started','trial_started','one_time_purchase')
      and b.occurred_at < ${end}::timestamp
      and b.received_at < ${end}::timestamp and ${customerAccount(sql`coalesce(b.account_id,b.external_user_id)`)}
    group by a.actor,a.platform,a.attempt_id
  ), purchase_flow_android_stripe as materialized (
    select account_id, properties->>'attempt_id' as attempt_id, properties->>'product' as product,
      bool_or(event_name='checkout_completed') as paid,
      bool_or(event_name='purchase_activated') as activated,
      max(received_at) filter(where event_name='checkout_completed') as latest_billing_receipt
    from analytics_events where platform='server' and environment='production'
      and occurred_at>=${start}::timestamp and occurred_at<${end}::timestamp and received_at<${end}::timestamp
      and properties->>'surface'='android_direct_paywall' and properties->>'provider'='stripe'
      and ((event_name='checkout_completed' and source='stripe_verified') or
        (event_name='purchase_activated' and source='stripe_access_verified'))
      and account_id is not null and nullif(properties->>'attempt_id','') is not null
    group by 1,2,3
  ), purchase_flow_flags as (
    select a.actor,a.platform,a.attempt_id,a.started,
      (array_agg(a.properties order by occurred_at,received_at) filter(where event_name='purchase_started'))[1] as context,
      (array_agg(a.app_version order by occurred_at,received_at) filter(where event_name='purchase_started'))[1] as release,
      (array_agg(event_name order by occurred_at desc,received_at desc))[1] as last_event,
      (array_agg(properties order by occurred_at desc,received_at desc))[1] as last_context,
      max(occurred_at) as last_observation,
      bool_or(event_name='purchase_recovered' or event_name='purchase_reconciled') as recovery_checked,
      bool_or(event_name='checkout_started') as requested,
      bool_or(event_name='purchase_completed' or (event_name='purchase_reconciled' and a.properties->>'result' in ('provider_purchase_observed','activated'))) or coalesce(m.verified,false) or coalesce(bool_or(stripe.paid),false) as purchased,
      bool_or(event_name='purchase_activated' or (event_name='purchase_reconciled' and a.properties->>'result'='activated')) or coalesce(bool_or(stripe.activated),false) as activated,
      coalesce(m.verified,false) or coalesce(bool_or(stripe.paid),false) as verified,coalesce(m.existing_purchase,false) as existing_purchase,
      greatest(m.latest_billing_receipt,max(stripe.latest_billing_receipt)) as latest_billing_receipt,
      (array_agg(event_name order by occurred_at desc,received_at desc) filter(where event_name in ('purchase_cancelled','purchase_failed','purchase_pending','purchase_activation_failed','purchase_account_required')))[1] as terminal,
      (array_agg(properties order by occurred_at desc,received_at desc) filter(where event_name in ('purchase_cancelled','purchase_failed','purchase_pending','purchase_activation_failed','purchase_account_required')))[1] as terminal_context,
      (array_agg(properties->>'feedback_reason' order by occurred_at desc,received_at desc) filter(where event_name='purchase_cancel_feedback'))[1] as feedback
    from purchase_flow_attempt_events a left join purchase_flow_matches m using(actor,platform,attempt_id)
      left join purchase_flow_android_stripe stripe on a.platform='android' and a.event_name='purchase_started'
        and a.properties->>'provider'='stripe' and stripe.account_id=a.account_id and stripe.attempt_id=a.attempt_id
        and stripe.product=a.properties->>'product'
    group by a.actor,a.platform,a.attempt_id,a.started,m.verified,m.existing_purchase,m.latest_billing_receipt
  ), purchase_flow_attempts as materialized (
    select *,case
      when activated and existing_purchase then 'existing_access'
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
      count(*) filter(where outcome='existing_access') as restored_access,
      count(*) filter(where outcome='cancelled') as cancellations,
      count(*) filter(where outcome in ('preparation_failed','store_failed','purchased_access_failed')) as errors,
      count(*) filter(where outcome='store_failed' and terminal_context->>'error_code'='3') as restricted,
      count(*) filter(where outcome in ('preparation_failed','store_failed','purchased_access_failed') and coalesce(terminal_context->>'error_code','')<>'3') as technical_errors,
      count(*) filter(where outcome='unresolved') as unresolved,
      count(*) filter(where outcome='pending') as pending,
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
  ), purchase_flow_interruptions as (
    select coalesce(release,'unknown') as release,platform,
      coalesce(nullif(last_context->>'purchase_stage',''),'unknown') as stage,
      case when recovery_checked then 'recovery_unconfirmed'
        when last_context->>'app_state' in ('inactive','background') then 'app_left_active_state'
        when requested then 'no_store_callback' else 'before_store_request' end as evidence,
      count(*) as attempts,count(distinct actor) as devices,min(started) as oldest_attempt,max(last_observation) as latest_observation
    from purchase_flow_attempts where outcome='unresolved' group by 1,2,3,4 order by count(*) desc,1,2,3,4
  ), purchase_flow_builds as (
    select coalesce(release,'unknown') as release,platform,count(*) as attempts,
      count(*) filter(where purchased) as purchased,count(*) filter(where activated and purchased) as activated,
      count(*) filter(where outcome='cancelled') as cancellations,
      count(*) filter(where outcome in ('preparation_failed','store_failed','purchased_access_failed')) as errors,
      count(*) filter(where outcome='unresolved') as unresolved,
      count(*) filter(where outcome='pending') as pending
    from purchase_flow_attempts group by 1,2 order by count(*) desc,1,2
  ), purchase_flow_feedback as (
    select feedback as reason,count(*) as responses from purchase_flow_attempts where feedback is not null group by feedback order by count(*) desc,feedback
  ), purchase_flow_support as (
    select event_name,count(*) as events,count(distinct actor) as devices from purchase_flow_events
    where event_name in ('restore_started','restore_failed','purchase_restored','activation_code_redeemed')
      or (platform='android' and event_name='purchase_activation_failed' and properties->>'reason_code'='stripe_confirmation')
    group by event_name order by event_name
  ), purchase_flow_catalog as (
    select coalesce(app_version,'unknown') as release,
      case properties->>'product_count' when '3' then 'complete' when '0' then 'empty'
        when '1' then 'partial' when '2' then 'partial' else 'unknown' end as availability,
      coalesce(properties->>'reason_code','not_recorded') as reason,
      count(*) as loads,count(distinct actor) as devices,
      round(avg(case when properties->>'duration_ms' ~ '^[0-9]{1,9}$' then (properties->>'duration_ms')::numeric end)) as average_ms
    from purchase_flow_events where event_name='paywall_products_loaded'
    group by 1,2,3 order by loads desc
  ), purchase_flow_coverage as (
    select count(*) filter(where event_name='purchase_started') as start_events,
      count(*) filter(where event_name='purchase_started' and (nullif(properties->>'attempt_id','') is null or actor is null)) as unlinked_starts,
      count(*) filter(where event_name='purchase_started' and properties->>'purchase_tracking_version'='2') as detailed_starts,
      count(*) filter(where event_name='paywall_viewed') as paywall_views,
      count(distinct actor) filter(where event_name='paywall_viewed') as paywall_devices,
      count(*) filter(where coalesce(properties->>'runtime_environment','unknown')='unknown') as runtime_unconfirmed_events,
      max(occurred_at) as latest_event,max(received_at) as latest_receipt,
      (select max(latest_billing_receipt) from purchase_flow_flags) as latest_billing_receipt
    from purchase_flow_events
  ), purchase_flow_stripe_activity as (
    select event_name,coalesce(nullif(properties->>'decline_code',''),nullif(properties->>'failure_code',''),'not_recorded') as reason,
      count(*) as events,count(distinct coalesce('account:' || account_id,'stripe:' || external_user_id)) as customers,
      max(occurred_at) as latest_event
    from billing_history where provider='stripe' and occurred_at>=${start}::timestamp
      and event_name in ('payment_failed','checkout_expired','checkout_confirmed','billing_issue_started')
    group by 1,2 order by count(*) desc,1,2
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
      'interruptions',coalesce((select json_agg(r) from purchase_flow_interruptions r),'[]'::json),
      'builds',coalesce((select json_agg(r) from purchase_flow_builds r),'[]'::json),
      'feedback',coalesce((select json_agg(r) from purchase_flow_feedback r),'[]'::json),
      'support',coalesce((select json_agg(r) from purchase_flow_support r),'[]'::json),
      'catalog',coalesce((select json_agg(r) from purchase_flow_catalog r),'[]'::json),
      'coverage',(select json_agg(r) from purchase_flow_coverage r),
      'handoffs',coalesce((select json_agg(r) from purchase_flow_handoffs r),'[]'::json),
      'stripeActivity',coalesce((select json_agg(r) from purchase_flow_stripe_activity r),'[]'::json)
    ) as report
  )`
}
