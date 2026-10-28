import { sql } from 'drizzle-orm'
import { reportingBucket } from './reporting-bucket'
import type { MetricRow } from './analytics'

export type CreatorAttributionData = {
  creators: MetricRow[]; summary: MetricRow[]; daily: MetricRow[]; trafficDaily: MetricRow[]; traffic: MetricRow[];
  accounts: MetricRow[]; milestones: MetricRow[]; coverage: MetricRow[]
}

// Uses the parent query's internal identity exclusions and production billing history.
export function creatorAttributionCTEs(start: string, end: string, days: number) {
  return sql`creator_links as materialized (
    select l.id, a.creator_profile_id as creator_id, p.display_name as creator,
      a.platform, a.handle from creator_tracking_links l
    join creator_social_accounts a on a.id = l.social_account_id
    join creator_profiles p on p.id = a.creator_profile_id
  ), creator_clicks as materialized (
    select c.*, l.creator_id from creator_attribution_clicks c join creator_links l on l.id = c.tracking_link_id
    where c.created_at >= ${start}::timestamp and c.created_at < ${end}::timestamp
      and not c.is_bot and c.source = 'browser'
      and not exists(select 1 from internal_identities i where i.anonymous_id = c.anonymous_actor_id)
  ), creator_events as materialized (
    select e.*, s.id as billing_id, coalesce(s.occurred_at,e.created_at) as at,
      coalesce('account:' || e.user_id, case when e.attribution_key like 'user:%' then 'account:' || substring(e.attribution_key from 6) else 'attribution:' || e.attribution_key end) as customer
    from creator_attribution_events e
    left join subscription_events s on s.id = e.metadata->>'billingEventId'
    where lower(coalesce(e.metadata->>'environment','production')) <> 'sandbox'
      and (s.id is null or s.environment = 'production')
      and coalesce(s.occurred_at,e.created_at) >= ${start}::timestamp
      and coalesce(s.occurred_at,e.created_at) < ${end}::timestamp
      and not exists(select 1 from internal_accounts i where i.id = e.user_id or i.id = s.account_id or i.id = s.external_user_id or e.attribution_key = 'user:' || i.id)
      and not exists(select 1 from internal_identities i where i.anonymous_id = e.anonymous_actor_id or i.mobile_install_id = e.mobile_install_id)
      and not exists(select 1 from creator_attribution_clicks c where c.id = e.click_id and c.is_bot)
  ), creator_credits as materialized (
    select e.*, 'direct'::text as credit, l.creator_id, l.creator, l.platform, l.handle
      from creator_events e join creator_links l on l.id = e.tracking_link_id
    union all
    select e.*, 'first'::text, l.creator_id, l.creator, l.platform, l.handle
      from creator_events e join creator_links l on l.id = e.first_tracking_link_id
  ), creator_summary as (
    select credit, upper(currency) as currency, creator_id,
      count(distinct customer) filter(where event_type = 'payment' and amount_cents > 0) as paying_customers,
      count(distinct creator_id) filter(where event_type = 'payment' and amount_cents > 0) as paying_creators,
      count(*) filter(where event_type = 'payment' and amount_cents > 0) as payments,
      coalesce(sum(amount_cents) filter(where event_type = 'payment' and amount_cents > 0),0)::numeric/100 as gross,
      -coalesce(sum(amount_cents) filter(where event_type in ('refund','dispute')),0)::numeric/100 as reversals,
      coalesce(sum(amount_cents) filter(where event_type in ('payment','refund','dispute')),0)::numeric/100 as net
    from creator_credits where event_type in ('payment','refund','dispute') and amount_cents <> 0 group by grouping sets ((credit,upper(currency),creator_id),(credit,upper(currency)))
  ), creator_accounts as (
    select credit,upper(currency) as currency,creator_id,platform,handle,
      count(distinct customer) filter(where event_type = 'payment' and amount_cents > 0) as paying_customers,
      coalesce(sum(amount_cents) filter(where event_type in ('payment','refund','dispute')),0)::numeric/100 as net
    from creator_credits group by 1,2,3,4,5
  ), creator_daily as (
    select ${reportingBucket(sql`at`, days)} as day,
      credit, upper(currency) as currency, creator_id,
      count(distinct customer) filter(where event_type = 'payment' and amount_cents > 0) as paying_customers,
      coalesce(sum(amount_cents) filter(where event_type in ('payment','refund','dispute')),0)::numeric/100 as net
    from creator_credits where event_type in ('payment','refund','dispute') and amount_cents <> 0 group by grouping sets ((1,credit,upper(currency),creator_id),(1,credit,upper(currency))) order by 1
  ), creator_traffic as (
    select creator_id, count(distinct creator_id) as active_creators, count(*) as clicks, count(distinct anonymous_actor_id) as visitors,
      count(*) filter(where anonymous_actor_id is null) as unidentified_clicks
    from creator_clicks group by grouping sets ((creator_id),())
  ), creator_traffic_daily as (
    select ${reportingBucket(sql`created_at`, days)} as day,creator_id,
      count(*) as clicks,count(distinct anonymous_actor_id) as visitors
    from creator_clicks group by grouping sets ((1,creator_id),(1)) order by 1
  ), creator_milestones as (
    select credit,creator_id,event_type::text as event,
      count(*) as events,count(distinct customer) as identities
    from creator_credits group by grouping sets ((credit,creator_id,event_type),(credit,event_type))
  ), creator_coverage as (
    select (select max(at) from creator_events) as latest_event,
      (select max(created_at) from creator_events) as latest_receipt,
      (select max(created_at) from creator_clicks) as latest_click,
      (select count(*) from creator_events where billing_id is null and event_type in ('payment','refund','dispute')) as legacy_money_events,
      (select count(*) from b where amount > 0 and creator_attribution_status not in ('allocated','internal','not_applicable')) as unallocated_payments,
      (select count(*) from b where amount is null and event_name in ('one_time_purchase','subscription_started','subscription_renewed','trial_converted','invoice_paid','subscription_refunded')) as missing_billing_amounts
  ), creator_attribution as (
    select json_build_object(
      'creators',coalesce((select json_agg(c) from (select distinct creator_id,creator from creator_links order by creator) c),'[]'::json),
      'accounts',coalesce((select json_agg(r) from creator_accounts r),'[]'::json),
      'summary',coalesce((select json_agg(r) from creator_summary r),'[]'::json),
      'daily',coalesce((select json_agg(r) from creator_daily r),'[]'::json),
      'trafficDaily',coalesce((select json_agg(r) from creator_traffic_daily r),'[]'::json),
      'traffic',coalesce((select json_agg(r) from creator_traffic r),'[]'::json),
      'milestones',coalesce((select json_agg(r) from creator_milestones r),'[]'::json),
      'coverage',coalesce((select json_agg(r) from creator_coverage r),'[]'::json)
    ) as report
  )`
}
