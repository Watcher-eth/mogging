import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { audienceCTEs, customerEvent } from './audience'
import { reportingBucket } from './reporting-bucket'
import { WEB_ANALYSIS_VARIANTS, WEB_FLOW_VERSION, webJourneyDimensions } from '@/lib/analytics/web-context'
import { WEB_ANALYSIS_CREATOR_COUPON } from '@/lib/payments/web-analysis-plans'
import { webChannel } from './analytics-channel'
import type { MetricRow } from './analytics'

export { webJourneyDimensions } from '@/lib/analytics/web-context'
export type WebJourneyDimension = typeof webJourneyDimensions[number]
export type WebJourneyReport = { version: string; dimension: string; summary: MetricRow[]; funnel: MetricRow[]; daily: MetricRow[]; segments: MetricRow[]; channels: MetricRow[]; onboardingDaily?: MetricRow[]; onboardingIssues?: MetricRow[]; experiments?: MetricRow[]; steps: MetricRow[]; issues: MetricRow[]; catalog: MetricRow[]; planOffers: MetricRow[]; versions: MetricRow[]; coverage: MetricRow[]; journeys: MetricRow[]; outcomes: MetricRow[]; postPurchase: MetricRow[] }

// reported_events includes browser activity and the customer-filtered server records.
// Billing and access are joined by exact checkout IDs. Account activity is never
// silently reassigned to a journey using a nearby timestamp.
export function webJourneyCTEs(start: string, end: string, days: number, version = WEB_FLOW_VERSION, dimension: WebJourneyDimension = 'channel', detail: 'Onboarding' | 'Purchases' | 'WebJourney' | 'Experiments' = 'WebJourney') {
  const segment = sql.identifier(dimension)
  const channel = webChannel(sql`properties`, true)
  const fromLanding = sql`((event_name in ('landing_viewed','page_viewed') and properties->>'path'='/')
    or (event_name='attribution_diagnostic' and properties->>'action'='creator_landing_viewed'
      and properties->>'surface'='creator_landing'))`
  return sql`wj_events as materialized (
    select event_name,platform,source,properties,session_id,account_id,occurred_at,actor,properties->>'flow_id' as flow_id
    from reported_events where platform in ('web','server')
      and nullif(properties->>'flow_id','') is not null
  ), wj_flows as materialized (
    select flow_id,
      min(occurred_at) filter(where platform='web' and (${fromLanding} or properties->>'path'='/analysis' or (event_name='paywall_viewed' and properties->>'surface' in ('web_analysis','landing','scan_app_credits')))) as started,
      coalesce((array_agg(properties->>'flow_version' order by occurred_at) filter(where nullif(properties->>'flow_version','') is not null))[1],'legacy') as version,
      coalesce((array_agg(properties->>'browser_family' order by occurred_at) filter(where properties->>'browser_family' is not null))[1],'unknown') as browser,
      coalesce((array_agg(${channel} order by occurred_at) filter(where platform='web' and ${channel} is not null))[1],
        (array_agg(${channel} order by occurred_at) filter(where ${channel} is not null))[1],'unknown_web') as channel,
      coalesce((array_agg(properties->>'device_platform' order by occurred_at) filter(where properties->>'device_platform' is not null))[1],'unknown') as device,
      coalesce((array_agg(properties->>'country' order by occurred_at) filter(where properties->>'country' is not null))[1],'unknown') as country,
      coalesce((array_agg(coalesce(properties->>'first_utm_source',properties->>'utm_source',properties->>'referrer_host') order by occurred_at) filter(where coalesce(properties->>'first_utm_source',properties->>'utm_source',properties->>'referrer_host') is not null))[1],'direct / unknown') as source,
      coalesce((array_agg(coalesce(properties->>'first_utm_campaign',properties->>'utm_campaign') order by occurred_at) filter(where coalesce(properties->>'first_utm_campaign',properties->>'utm_campaign') is not null))[1],'unattributed') as campaign,
      coalesce((array_agg(coalesce(properties->>'creator_tracking_link_id',properties->>'creator_first_tracking_link_id') order by occurred_at) filter(where coalesce(properties->>'creator_tracking_link_id',properties->>'creator_first_tracking_link_id') is not null))[1],'unattributed') as creator,
      coalesce((array_agg(properties->>'entry_mode' order by occurred_at) filter(where properties->>'entry_mode' is not null))[1],(array_agg(properties->>'surface' order by occurred_at) filter(where event_name='paywall_viewed' and properties->>'surface' is not null))[1],'unknown') as entry,
      coalesce((array_agg(coalesce(properties->>'product',properties->>'plan') order by occurred_at desc) filter(where event_name in ('checkout_started','plan_selected') and coalesce(properties->>'product',properties->>'plan') is not null))[1],'not selected') as plan,
      coalesce((array_agg(concat_ws(' / ',properties->>'experiment_id',properties->>'variant') order by occurred_at) filter(where properties->>'experiment_id' is not null))[1],'unassigned') as experiment,
      coalesce((array_agg(properties->>'analysis_variant' order by occurred_at) filter(where event_name='onboarding_step_viewed' and properties->>'surface'='web_analysis' and properties->>'analysis_variant' is not null))[1],'unassigned') as analysis_variant,
      min(occurred_at) filter(where platform='web' and ${fromLanding}) as landing_at,
      (array_agg(actor order by occurred_at) filter(where platform='web' and actor is not null))[1] as visitor,
      min(occurred_at) filter(where platform='web' and ((event_name='page_viewed' and properties->>'path'='/analysis') or (event_name='onboarding_step_viewed' and properties->>'surface'='web_analysis'))) as analysis_at,
      bool_or(event_name='app_store_redirected') as store_attempted,
      bool_or(event_name='destination_selected' and properties->>'placement'='store_fallback') as store_fallback,
      min(occurred_at) filter(where event_name='paywall_viewed') as paywall_at,
      min(occurred_at) filter(where platform='web' and event_name='paywall_viewed' and properties->>'surface'='web_analysis') as analysis_paywall_at,
      min(occurred_at) filter(where event_name='purchase_started' or (event_name='onboarding_interaction' and properties->>'action'='checkout_tapped')) as tapped_at,
      min(occurred_at) filter(where platform='web' and event_name='onboarding_step_viewed'
        and properties->>'surface'='web_analysis' and (properties->>'step' like 'capture.%' or properties->>'step'='upload')) as capture_at,
      min(occurred_at) filter(where event_name='photo_selected' or (event_name='face_capture_result' and properties->>'result'='captured')) as photo_at,
      min(occurred_at) filter(where event_name='report_viewed') as report_at,
      max(occurred_at) filter(where platform='server' and event_name='evaluation_request_completed' and source='web_analysis') as evaluated_at,
      bool_or(event_name='purchase_reconciled' and properties->>'result'='existing_access') as existing_access
    from wj_events group by flow_id
  ), wj_cohort as materialized (
    select * from wj_flows where started >= ${start}::timestamp and started < ${end}::timestamp and ${detail === 'Experiments' ? sql`analysis_at is not null` : sql`version=${version}`}
  ), wj_checkouts as materialized (
    select a.session_id as checkout_id,a.flow_id as flow_id,
      min(nullif(a.properties->>'attempt_id','')) as attempt_id,
      min(a.account_id) as account_id,min(a.occurred_at) filter(where a.event_name='checkout_started') as created_at,
      min(a.occurred_at) filter(where a.event_name='checkout_started' and a.source='web_analysis') as analysis_checkout_at
    from wj_events a join wj_cohort c on c.flow_id=a.flow_id
    where a.platform='server' and ((a.event_name='checkout_started') or (a.event_name='checkout_completed' and a.source='stripe_verified')) and a.session_id ~ '^cs_live_'
    group by 1,2
  ), wj_verified_checkouts as (
    select session_id,min(occurred_at) as paid_at,min(account_id) as account_id,
      bool_or(properties->>'mode'='subscription') as subscription
    from reported_events where platform='server' and event_name='checkout_completed' and source='stripe_verified'
      and session_id in (select checkout_id from wj_checkouts)
    group by 1
  ), wj_receipts as materialized (
    select s.checkout_id,s.flow_id,s.attempt_id,coalesce(s.account_id,v.account_id) as account_id,s.created_at,s.analysis_checkout_at,
      coalesce(v.paid_at,min(b.occurred_at) filter(where b.event_name='one_time_purchase' or (b.event_name='checkout_confirmed' and b.properties->>'payment_status'='paid'))) as paid_at,
      coalesce(v.subscription,false) or coalesce(bool_or(b.event_name='checkout_confirmed' and b.properties->>'payment_status'='paid'),false) as subscription,
      bool_or(b.event_name='payment_failed') as provider_failed,
      bool_or(b.event_name='checkout_completed_without_payment' or (b.event_name='checkout_status_observed' and b.properties->>'payment_status'='no_payment_required')) as free_checkout,
      bool_or(b.event_name='checkout_payment_pending' or (b.event_name='checkout_status_observed' and b.properties->>'status'='complete' and b.properties->>'payment_status'='unpaid')) as processing,
      bool_or(b.event_name='checkout_status_observed' and b.properties->>'status'='open' and b.occurred_at>${end}::timestamp-interval '2 hours') as open,
      bool_or(b.event_name='checkout_expired' or (b.event_name='checkout_status_observed' and b.properties->>'status'='expired')) as expired,
      bool_or(p.id is not null) as access_granted,
      bool_or(b.properties->>'creator_discount'=${WEB_ANALYSIS_CREATOR_COUPON}) as creator_discount
    from wj_checkouts s
    left join wj_verified_checkouts v on v.session_id=s.checkout_id
    left join subscription_events b on b.provider='stripe' and b.environment='production'
      and b.properties->>'checkout_session_id'=s.checkout_id and b.occurred_at < ${end}::timestamp
    left join payment_entitlements p on p.stripe_checkout_session_id=s.checkout_id and p.created_at < ${end}::timestamp
    group by s.checkout_id,s.flow_id,s.attempt_id,s.account_id,s.created_at,s.analysis_checkout_at,v.paid_at,v.subscription,v.account_id
  ), wj_receipt_totals as (
    select flow_id,min(created_at) as checkout_at,max(analysis_checkout_at) as last_analysis_checkout_at,min(paid_at) as paid_at,
      bool_or(subscription) filter(where paid_at is not null) as subscription,
      count(*) filter(where paid_at is not null) as paid_sessions,
      bool_or(access_granted) filter(where paid_at is not null) as granted,
      bool_or(creator_discount) filter(where paid_at is not null) as creator_discount
    from wj_receipts group by flow_id
  ), wj_report_deliveries as (
    select ev.flow_id as flow_id,max(ev.occurred_at) as evaluated_at
    from wj_events ev join wj_events viewed on viewed.flow_id=ev.flow_id
      and viewed.properties->>'report_id'=ev.properties->>'report_id'
      and viewed.event_name='report_viewed' and viewed.platform='web'
    where ev.platform='server' and ev.event_name='evaluation_request_completed' and ev.source='web_analysis'
    group by 1
  ), wj_states as materialized (
    select c.*,r.checkout_at,r.last_analysis_checkout_at,r.paid_at,r.subscription,r.paid_sessions,r.granted,r.creator_discount,
      ${detail === 'WebJourney' ? sql`coalesce(delivery.evaluated_at>=r.paid_at,false)` : sql`false`} as paid_report_viewed,
      c.paywall_at is not null as saw_paywall,
      c.paywall_at is not null and c.tapped_at >= c.paywall_at as tapped,
      c.paywall_at is not null and c.tapped_at >= c.paywall_at and (r.checkout_at is not null or r.paid_at is not null) as checkout,
      c.paywall_at is not null and c.tapped_at >= c.paywall_at and r.paid_at is not null as paid,
      case when r.paid_at is not null and c.evaluated_at >= r.paid_at then true else false end as paid_evaluation
    from wj_cohort c left join wj_receipt_totals r using(flow_id)
    ${detail === 'WebJourney' ? sql`left join wj_report_deliveries delivery using(flow_id)` : sql``}
  ), wj_summary as (
    select count(*) as journeys,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null) as landing_visitors,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null and paid_at>=landing_at) as paid_landing_visitors,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null and paid_at>=landing_at and subscription) as subscribed_landing_visitors,
      count(*) filter(where analysis_at is not null) as analysis_opened,
      count(*) filter(where analysis_paywall_at >= analysis_at) as analysis_paywalls,
      count(*) filter(where analysis_paywall_at >= analysis_at and last_analysis_checkout_at >= analysis_paywall_at) as analysis_checkouts,
      count(*) filter(where paid_at >= analysis_at) as paid_analysis,
      count(*) filter(where paid_at >= analysis_at and subscription) as subscribed_analysis,
      count(*) filter(where store_attempted) as store_attempts,
      count(*) filter(where store_fallback) as store_fallbacks,
      count(*) filter(where photo_at is not null) as photo_ready,
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
  ), wj_channels as (
    select channel,count(*) filter(where analysis_at is not null) as analysis_opened,
      count(*) filter(where capture_at>=analysis_at) as capture_opened,
      count(*) filter(where photo_at>=analysis_at) as photo_ready,
      count(*) filter(where analysis_paywall_at>=analysis_at) as analysis_paywalls,
      count(*) filter(where evaluated_at>=analysis_at) as evaluations_completed,
      count(*) filter(where report_at>=analysis_at) as report_viewed
      ${detail !== 'Onboarding' ? sql`, count(*) filter(where saw_paywall) as paywall_journeys,
      count(*) filter(where checkout_at is not null) as checkout_journeys,
      count(*) filter(where paid_at is not null) as paid_journeys,
      count(*) filter(where paid_at is not null and creator_discount) as creator_discount_purchases,
      count(*) filter(where paid_at >= paywall_at) as paid_from_paywall,
      count(*) filter(where paid_at is not null and subscription) as subscription_journeys,
      count(*) filter(where paid_at is not null and granted) as access_granted` : sql``}
    from ${sql.identifier(detail === 'Onboarding' ? 'wj_cohort' : 'wj_states')} group by 1 order by 1
  ), wj_daily as (
    select ${reportingBucket(sql`started`, days)} as day,count(*) as journeys,count(*) filter(where saw_paywall) as paywalls,
      count(*) filter(where paid_at is not null) as paid,count(*) filter(where paid and paid_evaluation) as evaluated,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null) as landing_visitors,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null and paid_at>=landing_at) as paid_landing_visitors
    from wj_states group by 1 order by 1
  ), wj_segments as (
    select ${segment} as segment,count(*) as journeys,count(*) filter(where saw_paywall) as paywalls,
      count(*) filter(where analysis_at is not null) as analysis_opened,
      count(*) filter(where analysis_paywall_at >= analysis_at) as analysis_paywalls,
      count(*) filter(where analysis_paywall_at >= analysis_at and last_analysis_checkout_at >= analysis_paywall_at) as analysis_checkouts,
      count(*) filter(where paid_at >= analysis_at) as paid_analysis,
      count(*) filter(where paid_at >= analysis_at and subscription) as subscribed_analysis,
      count(*) filter(where photo_at is not null) as photo_ready,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null) as landing_visitors,
      count(distinct coalesce(visitor,flow_id)) filter(where landing_at is not null and paid_at>=landing_at) as paid_landing_visitors,
      count(*) filter(where tapped) as checkout_taps,count(*) filter(where checkout) as checkouts,
      count(*) filter(where paid_at is not null) as paid,count(*) filter(where paid_at is not null and subscription) as subscriptions,
      count(*) filter(where paid and paid_evaluation) as evaluated
    from wj_states group by 1 order by journeys desc limit 50
  ), wj_steps as (
    select c.channel,a.properties->>'step' as step,count(distinct c.flow_id) filter(where event_name='onboarding_step_viewed') as viewed,
      count(distinct c.flow_id) filter(where event_name='onboarding_step_completed') as completed,
      round((percentile_cont(.5) within group(order by case when a.properties->>'duration_ms' ~ '^[0-9]{1,9}$' then (a.properties->>'duration_ms')::numeric end) filter(where event_name='onboarding_step_exited'))::numeric) as median_ms
    from wj_events a join wj_cohort c on c.flow_id=a.flow_id
    where a.event_name in ('onboarding_step_viewed','onboarding_step_completed','onboarding_step_exited') and (a.properties->>'step' like 'profile.%' or a.properties->>'step' like 'capture.%' or a.properties->>'step' in ('intro','story','upload','desktop-setup','desktop-scan','preview-analysis','report-preview','actual-analysis','results'))
    group by 1,2 order by channel,viewed desc,step
  ), wj_onboarding_daily as (
    select channel,${reportingBucket(sql`analysis_at`, days)} as day,count(*) as analysis_opened,
      count(*) filter(where photo_at>=analysis_at) as photo_ready,
      count(*) filter(where analysis_paywall_at>=analysis_at) as analysis_paywalls,
      count(*) filter(where evaluated_at>=analysis_at) as evaluations_completed
    from wj_cohort where analysis_at is not null group by 1,2 order by 2,1
  ), wj_experiment_cohorts as (
    select *,case
      when version in ('web_scan_2026_11_05','web_scan_2026_11_06_v3') then 'old'
      when analysis_variant=${WEB_ANALYSIS_VARIANTS.mobile} and channel='mobile_web' then 'new'
      when analysis_variant=${WEB_ANALYSIS_VARIANTS.desktop} and channel='desktop_web' then 'new'
      when channel='mobile_web' and analysis_variant='unassigned' and version=${WEB_FLOW_VERSION} then 'new'
    end as variant
    from wj_cohort
    where channel in ('mobile_web','desktop_web')
  ), wj_experiment_results as (
    select c.channel,c.variant,count(*) as started,
      count(*) filter(where c.analysis_at <= ${end}::timestamp-interval '24 hours') as mature,
      count(*) filter(where c.capture_at between c.analysis_at and c.analysis_at+interval '24 hours') as capture_opened,
      count(*) filter(where c.photo_at between c.analysis_at and c.analysis_at+interval '24 hours') as photo_ready,
      count(*) filter(where c.analysis_paywall_at between c.analysis_at and c.analysis_at+interval '24 hours') as paywalls,
      count(*) filter(where c.analysis_at <= ${end}::timestamp-interval '24 hours' and outcome.paid) as paid,
      count(*) filter(where c.analysis_at <= ${end}::timestamp-interval '24 hours' and outcome.subscribed) as subscribed,
      count(*) filter(where c.analysis_at <= ${end}::timestamp-interval '24 hours' and outcome.checkout) as checkouts
    from wj_experiment_cohorts c left join (
      select x.flow_id,bool_or(r.analysis_checkout_at between x.analysis_at and x.analysis_at+interval '24 hours') as checkout,
        bool_or(r.paid_at between x.analysis_at and x.analysis_at+interval '24 hours') as paid,
        bool_or(r.paid_at between x.analysis_at and x.analysis_at+interval '24 hours' and r.subscription) as subscribed
      from wj_experiment_cohorts x join wj_receipts r using (flow_id)
      where r.analysis_checkout_at>=x.analysis_at group by x.flow_id
    ) outcome using(flow_id)
    where c.variant is not null group by 1,2 order by 1,2 desc
  ), wj_issues as (
    select c.channel,event_name,coalesce(a.properties->>'purchase_stage',a.properties->>'step',a.properties->>'mode','unknown') as stage,
      coalesce(a.properties->>'reason_code',a.properties->>'result','unknown') as reason,count(*) as events,count(distinct c.flow_id) as journeys
    from wj_events a join wj_cohort c on c.flow_id=a.flow_id
    where a.event_name in ('purchase_failed','purchase_activation_failed','evaluation_request_failed','photo_validation_failed')
      or (a.event_name='paywall_products_loaded' and a.properties->>'products_loaded'='false')
      or (a.event_name='permission_result' and a.properties->>'result' in ('failed','denied'))
      or (a.event_name in ('photo_preparation_stage','face_capture_result') and a.properties->>'result' in ('failed','stalled'))
    group by 1,2,3,4 order by journeys desc limit 100
  ), wj_catalog as (
    select c.channel,coalesce(a.properties->>'mode','unknown') as mode,
      case when a.properties->>'products_loaded'='true' then 'loaded' when a.properties->>'products_loaded'='false' then 'failed' else 'unconfirmed' end as result,
      count(*) as loads,count(distinct c.flow_id) as journeys,
      round((percentile_cont(.5) within group(order by case when a.properties->>'duration_ms' ~ '^[0-9]{1,9}$' then (a.properties->>'duration_ms')::numeric end))::numeric) as median_ms
    from wj_events a join wj_cohort c on c.flow_id=a.flow_id where a.event_name='paywall_products_loaded' group by 1,2,3
  ), wj_plan_impressions as materialized (
    select c.channel,c.browser,c.flow_id,a.occurred_at,
      a.properties->>'product' as product,a.properties->>'offering' as offering,
      a.properties->>'currency' as currency,a.properties->>'price' as price,
      a.properties->>'first_payment_price' as first_payment_price,
      a.properties->>'creator_discount' as creator_discount,
      a.properties->>'status'='available' as available,
      a.properties->>'default_plan'=a.properties->>'product' as selected_by_default
    from wj_events a join wj_cohort c on c.flow_id=a.flow_id
    where a.platform='web' and a.event_name='paywall_plan_viewed' and a.properties->>'surface'='web_analysis'
  ), wj_plan_checkouts as (
    select impression.*,r.paid_at,
      coalesce(a.properties->>'creator_discount'=${WEB_ANALYSIS_CREATOR_COUPON},false) as creator_discount_applied
    from wj_receipts r join wj_events a on a.session_id=r.checkout_id and a.flow_id=r.flow_id
      and a.platform='server' and a.event_name='checkout_started' and a.source='web_analysis'
    join lateral (
      select i.* from wj_plan_impressions i
      where i.flow_id=r.flow_id and i.product=a.properties->>'product' and i.available
        and i.offering=coalesce(a.properties->>'offering','standard') and i.occurred_at<=r.created_at
      order by i.occurred_at desc limit 1
    ) impression on true
  ), wj_plan_offers as (
    select channel,browser,product,offering,currency,price,first_payment_price,creator_discount,
      count(distinct flow_id) filter(where shown) as shown,
      count(distinct flow_id) filter(where shown and available) as selectable,
      count(distinct flow_id) filter(where shown and available and selected_by_default) as default_journeys,
      count(distinct flow_id) filter(where checkout) as checkouts,
      count(distinct flow_id) filter(where paid_at is not null) as paid,
      count(distinct flow_id) filter(where creator_discount_applied) as discount_applied
    from (
      select i.*,true as shown,false as checkout,null::timestamp as paid_at,false as creator_discount_applied from wj_plan_impressions i
      union all
      select c.channel,c.browser,c.flow_id,c.occurred_at,c.product,c.offering,c.currency,c.price,c.first_payment_price,
        c.creator_discount,c.available,c.selected_by_default,false,true,c.paid_at,c.creator_discount_applied from wj_plan_checkouts c
    ) observed
    group by 1,2,3,4,5,6,7,8 order by shown desc,channel,browser,product
  ), wj_attempts as (
    select a.properties->>'attempt_id' as attempt_id,c.flow_id,c.channel,
      bool_or(r.paid_at is not null) as paid,bool_or(r.expired) as expired,
      bool_or(r.provider_failed) as provider_failed,bool_or(r.free_checkout) as free_checkout,
      bool_or(r.processing) as processing,bool_or(r.open) as open,
      bool_or(a.event_name='purchase_cancelled') as cancelled,
      bool_or(a.event_name='purchase_failed') as failed,
      bool_or(a.event_name='purchase_reconciled' and a.properties->>'result'='existing_access') as existing_access,
      bool_or(r.checkout_id is not null) as created
    from wj_events a join wj_cohort c on c.flow_id=a.flow_id
    left join wj_receipts r on r.flow_id=c.flow_id and r.attempt_id=a.properties->>'attempt_id'
    where nullif(a.properties->>'attempt_id','') is not null
    group by 1,2,3
    having bool_or(r.checkout_id is not null or (a.event_name='purchase_started' and a.platform='web'))
  ), wj_outcomes as (
    select channel,case when paid then 'Stripe payment verified' when existing_access then 'Existing access used'
      when expired then 'Stripe checkout expired'
      when provider_failed then 'Stripe payment failed' when free_checkout then 'Completed without payment'
      when processing then 'Awaiting payment settlement' when cancelled then 'Returned from cancelled checkout'
      when failed then 'Preparation or checkout error' when open then 'Open in Stripe' when created then 'Awaiting Stripe status'
      else 'Interrupted before checkout · outcome unconfirmed' end as outcome,count(*) as attempts
    from wj_attempts group by 1,2 order by channel,attempts desc,outcome
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
      max(occurred_at) as latest_event,
      (select count(distinct session_id) from reported_events
        where platform='server' and event_name='checkout_started' and session_id ~ '^cs_live_'
          and source in ('web_analysis','homepage','web2app','scan_app_credits')
          and nullif(properties->>'flow_id','') is null) as checkouts_missing_journey,
      (select count(distinct session_id) from reported_events
        where platform='server' and event_name='checkout_completed' and source='stripe_verified' and session_id ~ '^cs_live_'
          and properties->>'surface' in ('web_analysis','homepage','web2app','scan_app_credits')
          and (nullif(properties->>'flow_id','') is null or account_id is null)) as payments_missing_link
    from e where platform='web' and (properties->>'path'='/analysis' or properties->>'surface'='web_analysis')
  ), wj_versions as (
    select version,count(*) as journeys from wj_flows where started is not null group by 1 order by journeys desc
  ), web_journey as (
    select json_build_object(
      'version',${version}::text,
      'channels',${detail === 'Experiments' ? sql`'[]'::json` : sql`coalesce((select json_agg(r) from wj_channels r),'[]'::json)`},
      'onboardingDaily',${detail === 'Onboarding' ? sql`coalesce((select json_agg(r) from wj_onboarding_daily r),'[]'::json)` : sql`'[]'::json`},
      'onboardingIssues',${detail === 'Onboarding' ? sql`coalesce((select json_agg(r) from wj_issues r),'[]'::json)` : sql`'[]'::json`},
      'experiments',${detail === 'Experiments' ? sql`coalesce((select json_agg(r) from wj_experiment_results r),'[]'::json)` : sql`'[]'::json`},
      'steps',${detail === 'Onboarding' || detail === 'WebJourney' ? sql`coalesce((select json_agg(r)from wj_steps r),'[]'::json)` : sql`'[]'::json`},
      'outcomes',${detail === 'WebJourney' || detail === 'Purchases' ? sql`coalesce((select json_agg(r)from wj_outcomes r),'[]'::json)` : sql`'[]'::json`}
    )::jsonb ${detail === 'WebJourney' ? sql`|| jsonb_build_object('dimension',${dimension}::text,
      'summary',(select json_agg(r) from wj_summary r),
      'funnel',(select json_build_array(
        json_build_object('step','Site / flow entered','journeys',journeys),json_build_object('step','Paywall viewed','journeys',paywalls),
        json_build_object('step','Checkout tapped','journeys',checkout_taps),json_build_object('step','Stripe checkout created','journeys',checkouts),
        json_build_object('step','Payment verified','journeys',paid_journeys),json_build_object('step','Entitlement created','journeys',access_granted),
        json_build_object('step','Evaluation completed on server','journeys',evaluated),json_build_object('step','Report viewed','journeys',report_viewed)) from wj_summary),
      'daily',coalesce((select json_agg(r)from wj_daily r),'[]'::json),'segments',coalesce((select json_agg(r)from wj_segments r),'[]'::json),
      'issues',coalesce((select json_agg(r)from wj_issues r),'[]'::json),
      'catalog',coalesce((select json_agg(r)from wj_catalog r),'[]'::json),
      'planOffers',coalesce((select json_agg(r)from wj_plan_offers r),'[]'::json),'coverage',(select json_agg(r)from wj_coverage r),
      'versions',coalesce((select json_agg(r)from wj_versions r),'[]'::json),
      'postPurchase',(select json_agg(r)from wj_post_purchase r),
      'journeys',coalesce((select json_agg(r)from(select flow_id,to_char(started,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as started,browser,device,entry,plan,
        case when paid_evaluation then 'evaluation_completed' when paid_at is not null then 'payment_verified' when checkout then 'checkout_created' when tapped then 'checkout_tapped' when saw_paywall then 'paywall_viewed' when photo_at is not null then 'photo_ready' when analysis_at is not null then 'analysis_opened' else 'landing' end as latest_milestone
        from wj_states order by started desc limit 40)r),'[]'::json)
    )` : sql``} as report
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
