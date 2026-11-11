import { sql } from 'drizzle-orm'
import { webChannel } from './analytics-channel'
import { reportingBucket } from './reporting-bucket'

// The requested App Store Small Business scenario. Provider estimates remain
// separate so a 30% RevenueCat setting cannot silently replace this assumption.
export const APP_STORE_COMMISSION_RATE = 0.15

const billingSource = sql`case when provider='stripe' then 'Stripe'
  when properties->>'store'='APP_STORE' then 'Apple App Store'
  when properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'Google Play'
  else provider || ' · ' || coalesce(properties->>'store','unknown store') end`

// One reporting projection feeds headlines, products and charts. Provider USD
// prices are used verbatim; missing conversions remain unknown, never zero.
export function revenueUsdAmount(alias: ReturnType<typeof sql>) {
  return sql`case when upper(${alias}.currency)='USD' then ${alias}.amount
    when jsonb_typeof(${alias}.properties->'usd_amount')='number' then (${alias}.properties->>'usd_amount')::numeric end`
}

export function revenueReportingCTEs(start: string) {
  const fields = sql`h.id,h.provider,h.provider_event_id,h.provider_type,h.event_name,h.environment,h.account_id,h.external_user_id,
    h.subscription_id,h.transaction_id,h.product_id,h.properties,h.occurred_at,h.received_at`
  return sql`revenue_reporting_history as materialized (
    select ${fields},h.currency,h.amount,h.amount as original_amount from billing_history h
    union all
    select ${fields},'USD_TOTAL' as currency,
      ${revenueUsdAmount(sql`h`)} as amount,
      h.amount as original_amount from billing_history h
  ), revenue_reporting_period as materialized (
    select * from revenue_reporting_history where occurred_at>=${start}::timestamp
  )`
}

export function revenueReportCTEs(days: number, start: string, end: string) {
  const factChannel = webChannel(sql`h.properties`)
  const browserChannel = webChannel(sql`a.properties`, true)
  const channel = sql`case when h.provider='stripe' then coalesce(${factChannel}, subscription.channel, payment.channel, 'unknown_web')
    when h.properties->>'store'='APP_STORE' then 'ios'
    when h.properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'android'
    else 'unclassified' end`
  return sql`revenue_browser_channels as (
    select a.properties->>'flow_id' as flow_id, min(${browserChannel}) as channel
    from e a where a.platform='web' and nullif(a.properties->>'flow_id','') is not null
    group by 1 having count(distinct ${browserChannel})=1
  ), revenue_channel_facts as materialized (
    select h.subscription_id,h.transaction_id,
      coalesce(${factChannel}, browser.channel) as channel
    from billing_history h left join revenue_browser_channels browser on browser.flow_id=h.properties->>'flow_id'
    where h.provider='stripe'
  ), revenue_subscription_channels as (
    select subscription_id,min(channel) as channel from revenue_channel_facts
    where subscription_id is not null group by 1 having count(distinct channel)=1
  ), revenue_payment_channels as (
    select transaction_id,min(channel) as channel from revenue_channel_facts
    where transaction_id is not null group by 1 having count(distinct channel)=1
  ), revenue_channels as (
    select ${channel} as channel,coalesce(h.currency,'UNKNOWN') as currency,
      count(*) filter(where h.amount>0 and h.event_name<>'refund_reversed') as paid_transactions,
      coalesce(sum(h.amount) filter(where h.amount>0),0) as gross,
      coalesce(-sum(h.amount) filter(where h.amount<0),0) as refunds,
      sum(h.amount) as after_refunds
    from revenue_reporting_period h
    left join revenue_subscription_channels subscription using(subscription_id)
    left join revenue_payment_channels payment using(transaction_id)
    where h.amount<>0 group by 1,2 order by 1,2
  ), revenue_stream_events as materialized (
    select ${billingSource} as source, coalesce(currency,'UNKNOWN') as currency, occurred_at, amount
    from revenue_reporting_history where amount<>0
      and occurred_at >= ${start}::timestamp - ${days}::integer * interval '1 day'
  ), revenue_stream_comparison as (
    select source,currency,
      coalesce(sum(amount) filter(where occurred_at>=${start}::timestamp),0) as current_net,
      coalesce(sum(amount) filter(where occurred_at<${start}::timestamp),0) as previous_net,
      coalesce(sum(amount) filter(where amount>0 and occurred_at>=${start}::timestamp),0) as current_gross
    from revenue_stream_events group by 1,2 order by 1,2
  ), revenue_stream_daily as (
    select ${reportingBucket(sql`occurred_at`,days)} as day,source,currency,sum(amount) as net
    from revenue_stream_events where occurred_at>=${start}::timestamp group by 1,2,3 order by 1,2,3
  ), revenue_money as materialized (
    select *, ${billingSource} as source,
      coalesce(nullif(upper(properties->>'country'),''),'Unknown') as country,
      case when jsonb_typeof(properties->'tax_percentage')='number'
        and (properties->>'tax_percentage')::numeric between 0 and 1
        then (properties->>'tax_percentage')::numeric end as tax_rate,
      case when jsonb_typeof(properties->'commission_percentage')='number'
        and (properties->>'commission_percentage')::numeric between 0 and 1
        then (properties->>'commission_percentage')::numeric end as provider_commission
    from revenue_reporting_period where amount<>0
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
      count(*) filter(where amount>0 and event_name<>'refund_reversed') as purchases,count(*) filter(where amount<0) as refund_transactions,
      coalesce(sum(amount) filter(where amount>0),0) as gross,coalesce(-sum(amount) filter(where amount<0),0) as refunds,
      sum(amount) as after_refunds,
      sum(case when provider='revenuecat' and jsonb_typeof(properties->'usd_amount')='number'
        then (properties->>'usd_amount')::numeric when upper(currency)='USD' then amount end) as comparable_usd,
      count(*) filter(where upper(currency) is distinct from 'USD' and
        (provider<>'revenuecat' or jsonb_typeof(properties->'usd_amount') is distinct from 'number')) as missing_usd_events,
      sum(taxes) as taxes,sum(fees) as fees,
      case when count(*) filter(where proceeds is null)=0 then sum(proceeds) end as proceeds,
      case when count(*) filter(where provider_proceeds is null)=0 then sum(provider_proceeds) end as provider_estimated_proceeds,
      count(*) filter(where proceeds is null) as unknown_fee_events
    from revenue_fees group by 1,2 order by 1,2
  ), revenue_usd_coverage as (
    select source,count(*) as monetary_events,count(usd_amount) as covered_events,
      sum(usd_amount) as covered_after_refunds,
      case when count(usd_amount)=count(*) then sum(usd_amount) end as after_refunds
    from (
      select source,case when currency='USD' then amount
        when jsonb_typeof(properties->'usd_amount')='number' then (properties->>'usd_amount')::numeric
        end as usd_amount from revenue_money where currency<>'USD_TOTAL'
    ) observed group by 1 order by 1
  ), revenue_countries as (
    select country,coalesce(currency,'UNKNOWN') as currency,count(*) filter(where amount>0 and event_name<>'refund_reversed') as purchases,
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
      coalesce(latest.product_id,(select f.product_id from subscription_facts f where f.provider=current.provider
        and f.subscription_id=current.subscription_id and f.product_id is not null
        order by f.occurred_at desc,f.received_at desc,f.id desc limit 1),'Unknown product') as product,
      case when current.provider='stripe' then 'Stripe'
        when latest.properties->>'store'='APP_STORE' then 'Apple App Store'
        when latest.properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'Google Play'
        else current.provider end as source,
      case when current.provider='stripe' then coalesce(web.channel,'unknown_web')
        when latest.properties->>'store'='APP_STORE' then 'ios'
        when latest.properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'android'
        else 'unclassified' end as channel,
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
      order by (product_id is not null) desc,occurred_at desc,received_at desc,id desc limit 1) latest on true
    left join revenue_subscription_channels web on current.provider='stripe' and web.subscription_id=current.subscription_id
    where current.snapshot=0
  ), revenue_subscription_prices as (
    select s.*,coalesce(p.properties->>'recurring_currency',p.currency,'UNKNOWN') as currency,
      (case when jsonb_typeof(p.properties->'recurring_unit_amount')='number' then (p.properties->>'recurring_unit_amount')::numeric / 100
        when p.amount>0 then p.amount end) * cadence.factor as monthly_amount,
      (case when s.provider='revenuecat' and jsonb_typeof(p.properties->'usd_amount')='number'
        then nullif((p.properties->>'usd_amount')::numeric,0)
        when p.properties->>'recurring_currency'='USD' and jsonb_typeof(p.properties->'recurring_unit_amount')='number' then (p.properties->>'recurring_unit_amount')::numeric / 100
        when upper(p.currency)='USD' and p.amount>0 then p.amount end) * cadence.factor as monthly_usd
    from revenue_subscription_states s
    left join lateral (
      select amount,currency,properties from subscription_facts f where f.provider=s.provider and f.subscription_id=s.subscription_id
        and (f.product_id=s.product or (s.provider='stripe' and f.product_id is null)) and f.event_name in ('subscription_started','subscription_renewed','trial_converted','invoice_paid')
        order by (amount>0) desc nulls last,occurred_at desc,received_at desc,id desc limit 1
    ) p on true
    cross join lateral (select case s.product
      when 'web_basic_weekly' then 52::numeric/12
      when 'web_basic_monthly' then 1::numeric when 'web_pro_monthly' then 1::numeric
      when 'mogging.pro.weekly' then 4::numeric when 'mobile_subscription_weekly' then 4::numeric
      when 'mogging.pro.monthly' then 1::numeric when 'mobile_subscription_monthly' then 1::numeric
      when 'mogging.pro.yearly' then 1::numeric/12 when 'mobile_subscription_yearly' then 1::numeric/12
    end as factor) cadence
  ), revenue_subscription_mrr as (
    select source,channel,currency,
      count(*) filter(where not canceled and not billing_retry) as renewing_subscriptions,
      count(*) filter(where canceled and not billing_retry) as cancelling_subscriptions,
      count(*) filter(where billing_retry) as billing_retry_subscriptions,
      sum(monthly_amount) filter(where not canceled and not billing_retry) as known_renewing_mrr,
      case when count(*) filter(where not canceled and not billing_retry and monthly_amount is null)=0
        then coalesce(sum(monthly_amount) filter(where not canceled and not billing_retry),0) end as renewing_mrr,
      case when count(*) filter(where canceled and not billing_retry and monthly_amount is null)=0
        then coalesce(sum(monthly_amount) filter(where canceled and not billing_retry),0) end as cancelling_mrr,
      case when count(*) filter(where monthly_amount is null)=0 then sum(monthly_amount) end as active_access_mrr,
      count(*) filter(where monthly_amount is null) as missing_price_subscriptions,
      sum(monthly_usd) as active_mrr_usd,
      count(*) filter(where monthly_usd is null) as missing_mrr_usd_subscriptions
    from revenue_subscription_prices where has_access and not trial group by 1,2,3 order by 1,2,3
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
    select source,channel,product,count(*) filter(where has_access and not canceled and not trial and not billing_retry) as auto_renewing,
      count(*) filter(where has_access and canceled and not trial) as cancelling,
      count(*) filter(where has_access and trial) as trials,
      count(*) filter(where not ended and billing_retry) as billing_retry,
      count(*) filter(where ended or ends_at<=at) as ended,
      count(*) filter(where not ended and ends_at is null) as unknown_expiry
    from revenue_subscription_states group by 1,2,3 order by 1,2,3
  )`
}
