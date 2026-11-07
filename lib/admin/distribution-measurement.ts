import { sql } from 'drizzle-orm'
import { PERFORMANCE_EXCLUDED_CREATOR_IDS } from './creator-performance'
import type { MetricRow } from './analytics'

export type DistributionMeasurement = {
  start: string; end: string
  creators: MetricRow[]; billing: MetricRow[]; coverage: MetricRow[]; funnel: MetricRow[]
}

// This joins observed facts, not an inferred impression-to-customer conversion rate.
// Bio links identify a creator; only post-specific links identify a submitted video.
export function distributionMeasurementQuery(days: number, now: Date) {
  const end = now.toISOString(), start = new Date(now.getTime() - days * 86400_000).toISOString()
  const excluded = sql.join(PERFORMANCE_EXCLUDED_CREATOR_IDS.map(id => sql`${id}`), sql`, `)
  return sql`with creators as (
    select id,user_id,display_name from creator_profiles where id not in (${excluded})
  ), posts as (
    select distinct on(s.post_key) s.id,s.post_key,s.platform,s.creator_profile_id,
      greatest(coalesce(s.admin_view_count_threshold,0),coalesce(s.view_count_threshold,0)) as reported_views
    from creator_submissions s join creators p on p.id=s.creator_profile_id
    where not s.is_draft and s.post_key is not null and s.created_at<${end}::timestamp
    order by s.post_key,s.updated_at desc
  ), measured as (
    select p.*,latest.views,latest.source,latest.observed_at,
      case when latest.observed_at>=${start}::timestamp and latest.views>=opening.views then latest.views-opening.views end as gained_views
    from posts p left join lateral (
      select o.* from creator_video_observations o where o.post_key=p.post_key and o.source in ('tiktok_api','verified_recording')
        and o.observed_at<${end}::timestamp order by o.observed_at desc limit 1
    ) latest on true left join lateral (
      select o.views from creator_video_observations o where o.post_key=p.post_key and o.source=latest.source
        and o.observed_at<=${start}::timestamp order by o.observed_at desc limit 1
    ) opening on true
  ), clicks as (
    select c.*,a.creator_profile_id from creator_attribution_clicks c
    join creator_tracking_links l on l.id=c.tracking_link_id
    join creator_social_accounts a on a.id=l.social_account_id join creators p on p.id=a.creator_profile_id
    where not c.is_bot and c.created_at>=${start}::timestamp and c.created_at<${end}::timestamp
  ), money as (
    select e.id,e.event_type,e.amount_cents,e.user_id,e.currency,b.provider,b.occurred_at,a.creator_profile_id
    from creator_attribution_events e join subscription_events b on b.id=e.metadata->>'billingEventId'
    join creator_tracking_links l on l.id=e.tracking_link_id
    join creator_social_accounts a on a.id=l.social_account_id join creators p on p.id=a.creator_profile_id
    where b.environment='production' and b.occurred_at>=${start}::timestamp and b.occurred_at<${end}::timestamp
      and not exists(select 1 from users u where u.id=b.account_id and u.analytics_internal)
      and ((b.provider='stripe' and b.event_name in ('one_time_purchase','invoice_paid','subscription_renewed','subscription_refunded'))
        or (b.provider='revenuecat' and b.event_name in ('subscription_started','subscription_renewed','trial_converted','one_time_purchase','refund_reversed','subscription_refunded')))
      and e.event_type in ('payment','refund') and b.amount is not null
  ), creator_rows as (
    select p.display_name as creator,
      (select count(*) from posts s where s.creator_profile_id=p.id)::int as posts,
      (select sum(s.reported_views) from posts s where s.creator_profile_id=p.id) as reported_lifetime_views,
      (select sum(s.views) from measured s where s.creator_profile_id=p.id) as measured_lifetime_views,
      (select count(s.views) from measured s where s.creator_profile_id=p.id)::int as measured_posts,
      (select sum(s.gained_views) from measured s where s.creator_profile_id=p.id) as measured_views_gained,
      (select count(s.gained_views) from measured s where s.creator_profile_id=p.id)::int as posts_with_period_baseline,
      (select count(*) from clicks c where c.creator_profile_id=p.id)::int as link_clicks,
      (select count(*) from clicks c where c.creator_profile_id=p.id and c.submission_id is not null)::int as post_linked_clicks,
      (select count(distinct user_id) from money m where m.creator_profile_id=p.id and event_type='payment' and amount_cents>0)::int as attributed_paying_accounts,
      (select count(distinct m.user_id) from money m where m.creator_profile_id=p.id and event_type='payment' and amount_cents>0
        and exists(select 1 from scan_reservations r where r.user_id=m.user_id and r.status='complete'
          and r.created_at>=m.occurred_at and r.created_at<${end}::timestamp))::int as purchasers_with_completed_evaluation
    from creators p where exists(select 1 from posts s where s.creator_profile_id=p.id)
      or exists(select 1 from clicks c where c.creator_profile_id=p.id)
  ), billing_rows as (
    select p.display_name as creator,m.provider,upper(m.currency) as currency,
      sum(case when event_type='payment' then amount_cents else 0 end)::bigint as gross_cents,
      sum(case when event_type='refund' then abs(amount_cents) else 0 end)::bigint as refund_cents
    from money m join creators p on p.id=m.creator_profile_id group by p.display_name,m.provider,upper(m.currency)
  ), coverage_rows as (
    select a.platform,case when a.platform<>'tiktok' then 'recording_only'
      when coalesce(state.status,'')<>'' then state.status
      when a.connection_method<>'oauth' then 'connection_required'
      when coalesce(token.scope,'') !~ '(^|[ ,])video[.]list([ ,]|$)' then 'video_scope_required'
      else 'awaiting_sync' end as status,count(*)::int as accounts,
      sum((select count(*) from creator_submissions s where s.social_account_id=a.id and not s.is_draft
        and (s.post_key is null or (a.platform='tiktok' and s.post_key !~ '^tiktok:[0-9]+$'))))::int as posts_without_canonical_id,
      max(state.checked_at)::text as checked_at,max(state.synced_at)::text as synced_at
    from creator_social_accounts a join creators p on p.id=a.creator_profile_id
    left join creator_video_sync_state state on state.account_id=a.id
    left join accounts token on token.provider='tiktok-creator' and token.provider_account_id=a.provider_account_id and token.user_id=p.user_id
    where exists(select 1 from creator_submissions s where s.social_account_id=a.id and not s.is_draft)
    group by a.platform,2
  ), funnel_rows as (
    select coalesce(e.properties->>'browser_family','not_recorded') as browser,
      coalesce(e.properties->>'flow_version','not_recorded') as flow,
      coalesce(e.properties->>'entry_mode','not_recorded') as entry,
      count(distinct coalesce(e.account_id,e.anonymous_id)) filter(where event_name='onboarding_step_viewed')::int as onboarding_accounts_or_browsers,
      count(distinct coalesce(e.account_id,e.anonymous_id)) filter(where event_name='paywall_viewed')::int as paywall_accounts_or_browsers,
      count(distinct coalesce(e.account_id,e.anonymous_id)) filter(where event_name='purchase_started')::int as purchase_starters,
      count(distinct coalesce(e.account_id,e.anonymous_id)) filter(where event_name='purchase_activated')::int as client_access_confirmations,
      count(distinct coalesce(e.account_id,e.anonymous_id)) filter(where event_name='report_viewed')::int as report_viewers
    from analytics_events e where e.environment='production' and e.platform='web'
      and e.occurred_at>=${start}::timestamp and e.occurred_at<${end}::timestamp
      and e.properties->>'path'='/analysis'
      and not exists(select 1 from users u where u.id=e.account_id and u.analytics_internal)
    group by 1,2,3
  ) select json_build_object('start',${start}::text,'end',${end}::text,
    'creators',coalesce((select json_agg(r order by reported_lifetime_views desc nulls last) from creator_rows r),'[]'::json),
    'billing',coalesce((select json_agg(r) from billing_rows r),'[]'::json),
    'coverage',coalesce((select json_agg(r) from coverage_rows r),'[]'::json),
    'funnel',coalesce((select json_agg(r) from funnel_rows r),'[]'::json)) as data`
}
