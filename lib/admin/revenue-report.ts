import { sql } from 'drizzle-orm'
import { reportingBucket } from './reporting-bucket'

// The requested App Store Small Business scenario. Provider estimates remain
// separate so a 30% RevenueCat setting cannot silently replace this assumption.
export const APP_STORE_COMMISSION_RATE = 0.15

export function revenueReportCTEs(days: number, start: string, end: string) {
  return sql`revenue_money as materialized (
    select *, case when provider='stripe' then 'Stripe'
      when properties->>'store'='APP_STORE' then 'Apple App Store'
      when properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'Google Play'
      else provider || ' · ' || coalesce(properties->>'store','unknown store') end as source,
      coalesce(nullif(upper(properties->>'country'),''),'Unknown') as country,
      case when jsonb_typeof(properties->'tax_percentage')='number'
        and (properties->>'tax_percentage')::numeric between 0 and 1
        then (properties->>'tax_percentage')::numeric end as tax_rate,
      case when jsonb_typeof(properties->'commission_percentage')='number'
        and (properties->>'commission_percentage')::numeric between 0 and 1
        then (properties->>'commission_percentage')::numeric end as provider_commission
    from b where amount<>0
  ), revenue_fees as materialized (
    select *, amount*tax_rate as taxes,
      case when source='Apple App Store' then amount*(1-coalesce(tax_rate,0))*${APP_STORE_COMMISSION_RATE}::numeric
        else amount*provider_commission end as fees,
      case when source='Apple App Store' and tax_rate is not null then amount*(1-tax_rate)*(1-${APP_STORE_COMMISSION_RATE}::numeric)
        when source<>'Apple App Store' and tax_rate is not null and provider_commission is not null
          and tax_rate+provider_commission<=1 then amount*(1-tax_rate-provider_commission) end as proceeds,
      case when tax_rate is not null and provider_commission is not null and tax_rate+provider_commission<=1
        then amount*(1-tax_rate-provider_commission) end as provider_proceeds
    from revenue_money
  ), revenue_financials as (
    select coalesce(currency,'UNKNOWN') as currency,
      coalesce(sum(amount) filter(where amount>0),0) as gross,
      coalesce(-sum(amount) filter(where amount<0),0) as refunds,
      sum(amount) as after_refunds, sum(taxes) as taxes, sum(fees) as fees,
      sum(proceeds) as known_proceeds,
      case when count(*) filter(where proceeds is null)=0 then sum(proceeds) end as proceeds,
      count(*) filter(where proceeds is null) as unknown_fee_events,
      count(*) filter(where source='Apple App Store' and provider_commission is not null
        and abs(provider_commission-nullif(1-coalesce(tax_rate,0),0)*${APP_STORE_COMMISSION_RATE}::numeric)>0.005) as commission_mismatches,
      count(*) filter(where source='Apple App Store') as apple_events
    from revenue_fees group by 1
  ), revenue_sources as (
    select source,coalesce(currency,'UNKNOWN') as currency,
      count(*) filter(where amount>0) as purchases,count(*) filter(where amount<0) as refund_transactions,
      coalesce(sum(amount) filter(where amount>0),0) as gross,coalesce(-sum(amount) filter(where amount<0),0) as refunds,
      sum(amount) as after_refunds,sum(taxes) as taxes,sum(fees) as fees,
      case when count(*) filter(where proceeds is null)=0 then sum(proceeds) end as proceeds,
      case when count(*) filter(where provider_proceeds is null)=0 then sum(provider_proceeds) end as provider_estimated_proceeds,
      count(*) filter(where proceeds is null) as unknown_fee_events
    from revenue_fees group by 1,2 order by 1,2
  ), revenue_countries as (
    select country,coalesce(currency,'UNKNOWN') as currency,count(*) filter(where amount>0) as purchases,
      count(*) filter(where amount<0) as refund_transactions,
      coalesce(sum(amount) filter(where amount>0),0) as gross,coalesce(-sum(amount) filter(where amount<0),0) as refunds,
      sum(amount) as after_refunds,
      case when count(*) filter(where proceeds is null)=0 then sum(proceeds) end as proceeds
    from revenue_fees group by 1,2 order by purchases desc,country,currency
  ), revenue_proceeds_daily as (
    select ${reportingBucket(sql`occurred_at`,days)} as day,coalesce(currency,'UNKNOWN') as currency,
      case when count(*) filter(where proceeds is null)=0 then sum(proceeds) end as proceeds
    from revenue_fees group by 1,2
  ), revenue_subscription_states as (
    select current.provider,current.subscription_id,
      coalesce(latest.product_id,'Unknown product') as product,
      case when current.provider='stripe' then 'Stripe'
        when latest.properties->>'store'='APP_STORE' then 'Apple App Store'
        when latest.properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'Google Play'
        else current.provider end as source,
      current.at,current.ends_at,current.canceled,current.ended,
      coalesce((select max(f.occurred_at) from subscription_facts f where f.provider=current.provider and f.subscription_id=current.subscription_id and f.event_name in ('subscription_expired','subscription_refunded')),current.ends_at) as ended_at,
      current.ends_at>current.at and not current.ended as has_access,
      coalesce((select f.event_name='trial_started' from subscription_facts f
        where f.provider=current.provider and f.subscription_id=current.subscription_id
          and f.event_name in ('trial_started','trial_converted','subscription_started','subscription_renewed','invoice_paid')
        order by occurred_at desc,received_at desc,id desc limit 1),false) as trial,
      coalesce((select f.event_name='billing_issue_started' from subscription_facts f
        where f.provider=current.provider and f.subscription_id=current.subscription_id
          and f.event_name in ('billing_issue_started','subscription_renewed','invoice_paid','subscription_started','subscription_reactivated','trial_converted')
        order by occurred_at desc,received_at desc,id desc limit 1),false) as billing_retry,
      coalesce(initial.ends_at>initial.at and not initial.ended,false) as active_at_start
    from subscription_snapshots current
    left join subscription_snapshots initial on initial.snapshot=2 and initial.provider=current.provider and initial.subscription_id=current.subscription_id
    left join lateral(select product_id,properties from subscription_facts f
      where f.provider=current.provider and f.subscription_id=current.subscription_id
      order by occurred_at desc,received_at desc,id desc limit 1) latest on true
    where current.snapshot=0
  ), revenue_subscription_overview as (
    select count(*) filter(where has_access and not canceled and not trial and not billing_retry) as auto_renewing,
      count(*) filter(where has_access and canceled and not trial) as cancelling,
      count(*) filter(where has_access and trial) as trials,
      count(*) filter(where not ended and billing_retry) as billing_retry,
      count(*) filter(where has_access) as access_total,
      count(*) filter(where not ended and ends_at is null) as unknown_expiry,
      count(*) filter(where ended or ends_at<=at) as ended,
      count(*) filter(where (ended or ends_at<=at) and ended_at>=${start}::timestamp and ended_at<${end}::timestamp) as ended_in_period,
      (select count(distinct (provider,subscription_id)) from subscription_facts where event_name='cancellation_scheduled' and occurred_at>=${start}::timestamp) as cancellation_requests,
      count(*) filter(where active_at_start) as starting_subscriptions,
      count(*) filter(where active_at_start and (ended or ends_at<=at)) as churned_starting_subscriptions
    from revenue_subscription_states
  ), revenue_subscription_products as (
    select source,product,count(*) filter(where has_access and not canceled and not trial and not billing_retry) as auto_renewing,
      count(*) filter(where has_access and canceled and not trial) as cancelling,
      count(*) filter(where has_access and trial) as trials,
      count(*) filter(where not ended and billing_retry) as billing_retry,
      count(*) filter(where ended or ends_at<=at) as ended,
      count(*) filter(where not ended and ends_at is null) as unknown_expiry
    from revenue_subscription_states group by 1,2 order by 1,2
  )`
}
