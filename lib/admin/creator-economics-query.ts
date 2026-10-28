import { sql } from 'drizzle-orm'
import { reportingBucket } from './reporting-bucket'
import type { MetricRow } from './analytics'

export type CreatorEconomicsReport = {
  summary: MetricRow[]; daily: MetricRow[]; creators: MetricRow[]; currencies: MetricRow[];
  sources: MetricRow[]; mobile: MetricRow[]; billing: MetricRow[]; store: MetricRow[]; coverage: MetricRow[]
}

// Reuses customer exclusions and normalized attribution times from the parent query.
export function creatorEconomicsCTEs(start: string, end: string, days: number) {
  return sql`economics_payments as materialized (
    select creator_profile_id as creator_id,amount_cents,upper(currency) as currency,status,paid_at,created_at,updated_at,submission_id
    from creator_payments where created_at < ${end}::timestamp
      and (paid_at is null or paid_at < ${end}::timestamp)
  ), economics_revenue as materialized (
    select * from creator_credits where credit = 'direct' and event_type in ('payment','refund','dispute') and amount_cents <> 0
  ), economics_period as (
    select count(distinct customer) filter(where upper(currency)='USD' and event_type='payment' and amount_cents>0) as paying_customers,
      coalesce(sum(amount_cents) filter(where upper(currency)='USD'),0)::numeric/100 as net,
      (select coalesce(sum(amount_cents),0)::numeric/100 from economics_payments where currency='USD' and status='paid' and paid_at >= ${start}::timestamp) as cash_paid,
      (select coalesce(sum(amount_cents),0)::numeric/100 from economics_payments where currency='USD' and status in ('pending','processing')) as scheduled,
      (select coalesce(sum(amount_cents),0)::numeric/100 from economics_payments where currency='USD' and status='paid') as lifetime_paid,
      (select count(*) from economics_payments where currency='USD' and status='paid' and paid_at is null) as undated_paid,
      (select count(*) from economics_payments where status in ('pending','processing','paid') and currency<>'USD') as other_currency_payments
    from economics_revenue where at >= ${start}::timestamp
  ), economics_daily_raw as (
    select day,sum(net) as net,sum(cash_paid) as cash_paid from (
      select ${reportingBucket(sql`at`, days)} as day,sum(amount_cents)::numeric/100 as net,0::numeric as cash_paid
      from economics_revenue where at >= ${start}::timestamp and upper(currency)='USD' and amount_cents<>0 group by 1
      union all
      select ${reportingBucket(sql`paid_at`, days)},0::numeric,sum(amount_cents)::numeric/100
      from economics_payments where currency='USD' and status='paid' and paid_at >= ${start}::timestamp group by 1
    ) activity group by day order by day
  ), economics_buckets as (
    select distinct day from (
      select ${reportingBucket(sql`points.at`, days)} as day
      from generate_series(${start}::timestamp,${end}::timestamp,interval '1 hour') as points(at)
    ) buckets where day::timestamptz < ${end}::timestamptz
  ), economics_daily as (
    select buckets.day,coalesce(activity.net,0) as net,coalesce(activity.cash_paid,0) as cash_paid
    from economics_buckets buckets left join economics_daily_raw activity using(day) order by buckets.day
  ), economics_creator_revenue as (
    select creator_id,count(distinct customer) filter(where upper(currency)='USD' and event_type='payment' and amount_cents>0) as lifetime_payers,
      coalesce(sum(amount_cents) filter(where upper(currency)='USD'),0)::numeric/100 as lifetime_net,
      count(distinct customer) filter(where at >= ${start}::timestamp and upper(currency)='USD' and event_type='payment' and amount_cents>0) as period_payers,
      coalesce(sum(amount_cents) filter(where at >= ${start}::timestamp and upper(currency)='USD'),0)::numeric/100 as period_net
    from economics_revenue group by creator_id
  ), economics_creator_cost as (
    select creator_id,coalesce(sum(amount_cents) filter(where currency='USD' and status='paid'),0)::numeric/100 as lifetime_paid,
      coalesce(sum(amount_cents) filter(where currency='USD' and status in ('pending','processing')),0)::numeric/100 as scheduled,
      coalesce(sum(amount_cents) filter(where currency='USD' and status='paid' and paid_at >= ${start}::timestamp),0)::numeric/100 as period_paid
    from economics_payments group by creator_id
  ), economics_creators as (
    select p.id as creator_id,p.display_name as creator,
      coalesce(r.lifetime_payers,0) as lifetime_payers,coalesce(r.lifetime_net,0) as lifetime_net,
      coalesce(r.period_payers,0) as period_payers,coalesce(r.period_net,0) as period_net,
      coalesce(c.lifetime_paid,0) as lifetime_paid,coalesce(c.scheduled,0) as scheduled,coalesce(c.period_paid,0) as period_paid
    from creator_profiles p left join economics_creator_revenue r on r.creator_id=p.id
    left join economics_creator_cost c on c.creator_id=p.id
    where r.creator_id is not null or c.creator_id is not null
  ), economics_currencies as (
    select currency,sum(net) as net,sum(cash_paid) as cash_paid,sum(lifetime_paid) as lifetime_paid,sum(scheduled) as scheduled from (
      select upper(currency) as currency,sum(amount_cents)::numeric/100 as net,0::numeric as cash_paid,0::numeric as lifetime_paid,0::numeric as scheduled
      from economics_revenue where at >= ${start}::timestamp group by 1
      union all
      select currency,0::numeric,
        coalesce(sum(amount_cents) filter(where status='paid' and paid_at >= ${start}::timestamp),0)::numeric/100,
        coalesce(sum(amount_cents) filter(where status='paid'),0)::numeric/100,
        coalesce(sum(amount_cents) filter(where status in ('pending','processing')),0)::numeric/100
      from economics_payments where status in ('pending','processing','paid') group by currency
    ) amounts group by currency order by currency
  ), economics_sources as (
    select c.source,count(*) as requests,count(distinct c.anonymous_actor_id) as identified_actors
    from creator_attribution_clicks c where not c.is_bot and c.created_at >= ${start}::timestamp and c.created_at < ${end}::timestamp
      and not exists(select 1 from internal_identities i where i.anonymous_id=c.anonymous_actor_id)
    group by 1 order by 2 desc
  ), economics_mobile as (
    select m.method,count(*) as touches,count(distinct m.mobile_install_id) as installations,
      count(distinct m.mobile_install_id) filter(where m.user_id is not null) as account_claimed
    from mobile_creator_attributions m join creator_attribution_clicks c on c.id=m.click_id
    where not c.is_bot and m.created_at >= ${start}::timestamp and m.created_at < ${end}::timestamp
      and not exists(select 1 from internal_accounts i where i.id=m.user_id)
      and not exists(select 1 from internal_identities i where i.mobile_install_id=m.mobile_install_id)
    group by 1 order by 2 desc
  ), economics_billing as (
    select provider,creator_attribution_status as status,count(*) as events
    from b where event_name in ('subscription_started','trial_started','subscription_renewed','trial_converted','invoice_paid','one_time_purchase','subscription_refunded')
    group by 1,2 order by 1,events desc
  ), economics_store as (
    select m.campaign,m.day,m.territory,m.downloads,m.sales,m.currency,a.handle
    from creator_store_campaign_metrics m left join creator_tracking_links l on l.id=m.tracking_link_id
    left join creator_social_accounts a on a.id=l.social_account_id
    where m.day >= to_char(${start}::timestamptz at time zone 'America/Los_Angeles','YYYY-MM-DD')
      and m.day <= to_char(${end}::timestamptz at time zone 'America/Los_Angeles','YYYY-MM-DD')
      and m.imported_at < ${end}::timestamp
    order by m.day desc,m.campaign,m.territory limit 300
  ), economics_coverage as (
    select (select max(at) from economics_revenue where at >= ${start}::timestamp) as latest_revenue_event,
      (select max(created_at) from economics_revenue where at >= ${start}::timestamp) as latest_revenue_receipt,
      (select max(updated_at) from economics_payments) as latest_compensation_update,
      (select count(*) from economics_revenue where billing_id is null and at >= ${start}::timestamp) as legacy_money_events,
      (select count(*) from b where amount>0 and creator_attribution_status not in ('allocated','internal','not_applicable')) as unallocated_payments,
      (select max(imported_at) from creator_store_campaign_metrics where imported_at < ${end}::timestamp) as latest_store_import
  ), creator_economics as (
    select json_build_object(
      'summary',(select json_agg(r) from economics_period r),
      'daily',coalesce((select json_agg(r) from economics_daily r),'[]'::json),
      'creators',coalesce((select json_agg(r) from economics_creators r),'[]'::json),
      'currencies',coalesce((select json_agg(r) from economics_currencies r),'[]'::json),
      'sources',coalesce((select json_agg(r) from economics_sources r),'[]'::json),
      'mobile',coalesce((select json_agg(r) from economics_mobile r),'[]'::json),
      'billing',coalesce((select json_agg(r) from economics_billing r),'[]'::json),
      'store',coalesce((select json_agg(r) from economics_store r),'[]'::json),
      'coverage',(select json_agg(r) from economics_coverage r)
    ) as report
  )`
}
