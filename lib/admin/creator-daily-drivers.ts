import { sql } from 'drizzle-orm'
import { PERFORMANCE_EXCLUDED_CREATOR_IDS, PERFORMANCE_TIME_ZONE, performanceDay } from './creator-performance'
import { revenueUsdAmount } from './revenue-report'
import { campaignAudienceBands, campaignHasAudienceBands } from '@/lib/creator/sprint-defaults'
import { verifiedRecordingViewCount } from '@/lib/creator/verified-view-recording'
import type { SprintTerms } from '@/lib/creator/sprints'

export type DriverDay = {
  day: string; revenue: number; ios: number; web: number; iosRenewals: number; iosSales: number; paidSubscriptions: number; missingUsd: number;
  submissions: number; cohortViews: number; measuredViews: number | null; measuredPosts: number; estimatedViews: number | null; estimatedPosts: number;
  firstOpens: number; clicks: number; paywallAccounts: number; paidAfterPaywall: number;
}
export type DriverMix = { day: string; basis: 'measured' | 'cohort' | 'estimated'; campaign: string; country: string | null; views: number }
export type DriverTier = { day: string; basis: DriverMix['basis']; campaign: string; tier: string; views: number; approvedPercent: number | null }
export type DriverRecording = { day: string; campaign: string; title: string; viewers: number; views: number; exact: boolean; verified: boolean; tier: string }
export type DailyDriverReport = { daily: DriverDay[]; mix: DriverMix[]; tiers: DriverTier[]; recordings: DriverRecording[] }
type ApprovalEvidence = { approvedPercent: number | null; terms: SprintTerms | null }
type DailyDriverInput = Omit<DailyDriverReport, 'tiers' | 'recordings'> & {
  tiers: Array<Omit<DriverTier, 'tier'> & ApprovalEvidence>
  recordings: Array<Omit<DriverRecording, 'tier'> & ApprovalEvidence>
}

export function approvedAudienceTier({ approvedPercent, terms }: ApprovalEvidence) {
  if (approvedPercent == null) return 'No approved tier'
  if (!terms?.milestones?.length) return 'Terms unavailable'
  if (terms.retainer) return 'Retainer'
  if (!campaignHasAudienceBands(terms)) return 'Custom rates'
  const band = campaignAudienceBands(terms).findLast(band => approvedPercent >= band.minimumPercent)
  return band ? `Tier ${band.tier}` : 'Below tier bands'
}

export function buildDailyDriverReport(input: DailyDriverInput): DailyDriverReport {
  return { daily: input.daily, mix: input.mix,
    tiers: input.tiers.map(({ terms, ...row }) => ({ ...row, tier: approvedAudienceTier({ ...row, terms }) })),
    recordings: input.recordings.map(({ terms, approvedPercent, ...row }) => ({ ...row, tier: approvedAudienceTier({ approvedPercent, terms }) })),
  }
}
export type { DailyDriverInput }


// Anchors are cumulative counts by video and Pacific day. Split only the increase,
// preserving integer totals even when a reporting window clips the interval.
export const viewEstimateCTEs = sql`daily_anchors as (
  select id,day,max(views) as views from estimate_anchors group by id,day
), monotonic_anchors as (
  select *,max(views) over (partition by id order by day) as high_water from daily_anchors
), view_intervals as (
  select *,lag(day) over timeline as previous_day,lag(views) over timeline as previous_views
  from monotonic_anchors where views=high_water window timeline as (partition by id order by day)
), estimated_gains as (
  select a.id,d.day,(a.views-a.previous_views)*(d.day-a.previous_day)/(a.day-a.previous_day)
    -(a.views-a.previous_views)*(d.day-a.previous_day-1)/(a.day-a.previous_day) as views
  from view_intervals a join days d on d.day>a.previous_day and d.day<=a.day
)`

export function creatorDailyDriversQuery(now: Date) {
  const today = performanceDay(now)!
  const tz = PERFORMANCE_TIME_ZONE
  const day = (time: ReturnType<typeof sql>) => sql`((${time} at time zone 'UTC') at time zone ${tz})::date`
  const excluded = sql.join(PERFORMANCE_EXCLUDED_CREATOR_IDS.map(id => sql`${id}`), sql`, `)
  return sql`with bounds as (
    select ${today}::date - 30 as first_day, ${today}::date as today,
      (((${today}::date - 30)::timestamp at time zone ${tz}) at time zone 'UTC') as starts,
      ((${today}::date::timestamp at time zone ${tz}) at time zone 'UTC') as ends
  ), days as (
    select first_day + n as day from bounds cross join generate_series(0,29) as n
  ), posts as materialized (
    select s.id,s.post_key,s.status,s.view_count_threshold,s.review_requested_at,s.title,s.sprint_id,
      coalesce(s.sprint_terms,c.terms) as terms,s.admin_us_audience_percent,s.updated_at,coalesce(c.name,'Unassigned') as campaign,
      ${day(sql`s.posted_at`)} as published_day,
      greatest(coalesce(s.view_count_threshold,0),coalesce(s.admin_view_count_threshold,0)) as reported,
      ${day(sql`coalesce(history.submitted_at,s.created_at)`)} as day
    from creator_submissions s cross join bounds
    left join creator_sprints c on c.id=s.sprint_id
    left join lateral (select min(u.created_at) as submitted_at from creator_submission_updates u
      where u.submission_id=s.id and u.type='submitted') history on true
    where not s.is_draft and coalesce(history.submitted_at,s.created_at)<ends
      and s.creator_profile_id not in (${excluded})
  ), estimate_posts as materialized (
    select distinct on(coalesce(post_key,id)) * from posts
    order by coalesce(post_key,id),(status='rejected'),day,id
  ), milestone_events as materialized (
    select p.id,u.type,${day(sql`u.created_at`)} as day,u.created_at,
      case when u.history_snapshot->>'submittedViews' ~ '^[0-9]{1,10}$'
        then (u.history_snapshot->>'submittedViews')::bigint end as views
    from estimate_posts p join creator_submission_updates u on u.submission_id=p.id
    where u.type in ('submitted','rereview_requested')
  ), initial_milestones as (
    select p.id,p.day,coalesce(case when p.published_day<=p.day then p.published_day end,p.day-1) as launch_day,
      coalesce(first_submission.views,case when p.review_requested_at is null
        and not exists(select 1 from milestone_events r where r.id=p.id and r.type='rereview_requested')
        then p.view_count_threshold end)::bigint as views
    from estimate_posts p left join lateral (
      select m.views from milestone_events m where m.id=p.id and m.type='submitted'
      order by m.created_at limit 1
    ) first_submission on true
  ), api_observations as materialized (
    select o.post_key,o.submission_id,o.source,coalesce(o.measured_at,o.observed_at) as observed_at,o.views
    from creator_video_observations o cross join bounds
    where o.source='tiktok_api' and o.observed_at>=starts-interval '3 days' and o.observed_at<ends
      and coalesce(o.measured_at,o.observed_at)>=starts-interval '2 days' and coalesce(o.measured_at,o.observed_at)<ends
  ), exact_recordings as materialized (
    select p.id,p.post_key,a.assessed_at,exact.views from creator_submission_analytics a join posts p on p.id=a.submission_id
    cross join bounds cross join lateral (select ${verifiedRecordingViewCount(sql`a.data`, sql`a.storage_key`)} as views) exact
    where a.assessed_at<ends and exact.views is not null
  ), estimate_anchors as (
    select id,launch_day-1 as day,0::bigint as views from initial_milestones where views>=0
    union all select id,day,views from initial_milestones where views>=0
    union all select m.id,m.day,m.views from milestone_events m join estimate_posts p on p.id=m.id cross join bounds
      where m.type='rereview_requested' and m.views>=0 and m.day>=p.day and m.created_at<ends
    union all select p.id,${day(sql`p.review_requested_at`)},p.view_count_threshold::bigint from estimate_posts p cross join bounds
      where p.view_count_threshold>=0 and p.review_requested_at<ends and ${day(sql`p.review_requested_at`)}>=p.day
        and not exists(select 1 from milestone_events m where m.id=p.id and m.type='rereview_requested'
          and m.views is not null and m.day=${day(sql`p.review_requested_at`)})
    union all select p.id,${day(sql`r.assessed_at`)},r.views
      from exact_recordings r join estimate_posts p on p.id=r.id where ${day(sql`r.assessed_at`)}>=p.day
    union all select p.id,${day(sql`o.observed_at`)},o.views
      from api_observations o join estimate_posts p on p.post_key=o.post_key where ${day(sql`o.observed_at`)}>=p.day
  ), ${viewEstimateCTEs}, estimated as (
    select day,sum(views) as views,count(*)::int as posts from estimated_gains group by day
  ), cohorts as (
    select p.day,count(*)::int as submissions,sum(p.reported) as views from posts p join days using(day) group by p.day
  ), observations as (
    select * from api_observations
    union all
    select r.post_key,r.id,'verified_recording',r.assessed_at,r.views from exact_recordings r cross join bounds
    where r.post_key is not null and r.assessed_at>=starts-interval '2 days'
  ), local_observations as (
    select *,${day(sql`observed_at`)} as day from observations
  ), last_observations as (
    select distinct on(post_key,source,day) * from local_observations
    order by post_key,source,day,observed_at desc,submission_id
  ), gains as (
    select distinct on (current.post_key,current.day) current.day,current.submission_id,current.observed_at,current.views-previous.views as views
    from last_observations current join last_observations previous on previous.post_key=current.post_key
      and previous.source=current.source and previous.day=current.day-1
    join days on days.day=current.day
    where current.views>=previous.views and current.observed_at-previous.observed_at between interval '18 hours' and interval '30 hours'
    order by current.post_key,current.day,(current.source='tiktok_api') desc,current.observed_at desc
  ), tracked as (
    select g.day,sum(g.views) as views,count(*)::int as posts from gains g join posts p on p.id=g.submission_id group by g.day
  ), view_rows as (
    select 'cohort' as basis,p.day,p.id,p.campaign,p.reported::bigint as views,ends as cutoff from posts p join days using(day) cross join bounds
    union all
    select 'measured',g.day,p.id,p.campaign,g.views,g.observed_at from gains g join posts p on p.id=g.submission_id
    union all
    select 'estimated',g.day,p.id,p.campaign,g.views,ends from estimated_gains g join estimate_posts p on p.id=g.id cross join bounds
  ), breakdown as (
    select v.day,v.basis,v.campaign,null::text as country,sum(v.views) as views from view_rows v group by 1,2,3
    union all
    select v.day,v.basis,v.campaign,locations.code,sum(v.views*locations.share) as views
    from view_rows v join lateral (
      select a.data->'countries' as countries from creator_submission_analytics a
      where a.submission_id=v.id and a.assessed_at<=v.cutoff and a.data->>'status'='verified'
        and jsonb_typeof(a.data->'countries')='array' and a.data->'countries'<>'[]'::jsonb
      order by a.assessed_at desc,a.storage_key limit 1
    ) evidence on true cross join lateral (
      select code,pct/greatest(100,sum(pct) over ()) as share from (
        select item->>'code' as code,max((item->>'percent')::numeric) as pct
        from jsonb_array_elements(evidence.countries) item
        where item->>'code' ~ '^[A-Z]{2}$' and jsonb_typeof(item->'percent')='number'
          and (item->>'percent')::numeric between 0 and 100 group by 1
      ) named
    ) locations group by 1,2,3,4
  ), approvals as materialized (
    select p.id,
      case when approval.percent between 0 and 100 then approval.percent
        when p.status in ('approved','paid') and p.updated_at<ends and p.admin_us_audience_percent between 0 and 100
        then p.admin_us_audience_percent end as percent,
      case when approval.campaign_id is distinct from p.sprint_id and approval.campaign_id is not null
        then prior_campaign.terms else p.terms end as terms
    from posts p cross join bounds left join lateral (
      select (u.history_snapshot->>'verifiedAudiencePercent')::numeric as percent,
        u.history_snapshot->>'campaignId' as campaign_id
      from creator_submission_updates u where u.submission_id=p.id and u.type='approved' and u.created_at<ends
        and jsonb_typeof(u.history_snapshot->'verifiedAudiencePercent')='number'
      order by u.created_at desc,u.id limit 1
    ) approval on true left join creator_sprints prior_campaign on prior_campaign.id=approval.campaign_id
  ), tier_rows as (
    select v.day,v.basis,v.campaign,a.percent as "approvedPercent",a.terms,sum(v.views) as views
    from view_rows v join approvals a on a.id=v.id
    group by v.day,v.basis,v.campaign,a.percent,a.terms
  ), ocr_pairs as (
    select ${day(sql`pair.assessed_at`)} as day,p.campaign,p.title,pair.viewers,pair.views,pair.exact,pair.verified,
      a.percent as "approvedPercent",a.terms
    from estimate_posts p join approvals a on a.id=p.id cross join bounds join lateral (
      select r.assessed_at, (r.data#>>'{metrics,totalViewers}')::bigint as viewers,
        (r.data#>>'{metrics,totalViews}')::bigint as views,
        coalesce(r.data#>>'{metricsVerified,totalViewsExact}'='true' and r.data#>>'{metrics,totalViewsExact}'='true',false) as exact,
        coalesce(r.data#>>'{metricsVerified,totalViewers}'='true' and r.data#>>'{metricsVerified,totalViews}'='true',false) as verified
      from creator_submission_analytics r where r.submission_id=p.id and r.assessed_at>=starts and r.assessed_at<ends
        and case when r.data#>>'{metrics,totalViewers}' ~ '^[0-9]{1,10}$' and r.data#>>'{metrics,totalViews}' ~ '^[0-9]{1,10}$'
          then (r.data#>>'{metrics,totalViewers}')::bigint between 1 and (r.data#>>'{metrics,totalViews}')::bigint else false end
      order by verified desc,r.assessed_at desc,r.storage_key limit 1
    ) pair on true
  ), billing as materialized (
    select ${day(sql`b.occurred_at`)} as day,b.occurred_at,b.account_id,b.event_name,b.provider,b.subscription_id,b.id,
      b.provider='revenuecat' and coalesce(b.properties->>'store'='APP_STORE',false) as ios,
      b.provider='stripe' as web,b.amount as original,${revenueUsdAmount(sql`b`)} as usd
    from subscription_events b cross join bounds
    where b.environment='production' and b.amount<>0 and b.occurred_at>=starts and b.occurred_at<ends
      and not exists(select 1 from users u where u.id=coalesce(b.account_id,b.external_user_id) and u.analytics_internal)
  ), subscription_starts as (
    select distinct on (b.provider,b.subscription_id) b.day
    from billing b where b.original>0 and b.subscription_id is not null
      and b.event_name in ('subscription_started','trial_converted','invoice_paid','subscription_renewed')
      and not exists (select 1 from subscription_events previous
        where previous.provider=b.provider and previous.subscription_id=b.subscription_id
          and previous.environment='production' and previous.amount>0 and previous.occurred_at<b.occurred_at
          and previous.event_name in ('subscription_started','trial_converted','invoice_paid','subscription_renewed'))
    order by b.provider,b.subscription_id,b.occurred_at,b.id
  ), subscription_counts as (
    select day,count(*)::int as paid from subscription_starts group by day
  ), money as (
    select day,coalesce(sum(usd),0) as revenue,coalesce(sum(usd) filter(where ios),0) as ios,
      coalesce(sum(usd) filter(where web),0) as web,
      coalesce(sum(usd) filter(where ios and event_name='subscription_renewed' and original>0),0) as renewals,
      count(*) filter(where ios and original>0 and event_name in ('subscription_started','trial_converted','one_time_purchase'))::int as sales,
      count(*) filter(where usd is null)::int as missing
    from billing group by day
  ), app_events as materialized (
    select ${day(sql`a.occurred_at`)} as day,a.event_name,a.account_id,a.mobile_install_id,a.anonymous_id,a.occurred_at
    from analytics_events a cross join bounds
    where a.environment='production' and a.platform='ios' and a.event_name in ('app_first_open','paywall_viewed')
      and a.occurred_at>=starts and a.occurred_at<ends
      and not exists(select 1 from users u where u.id=a.account_id and u.analytics_internal)
  ), opens as (
    select day,count(distinct coalesce(mobile_install_id,anonymous_id,account_id))::int as n
    from app_events where event_name='app_first_open' group by day
  ), paywall as (
    select day,account_id,min(occurred_at) as opened_at from app_events where event_name='paywall_viewed'
      and account_id is not null group by day,account_id
  ), conversions as (
    select p.day,count(*)::int as accounts,count(*) filter(where exists(select 1 from billing b
      where b.day=p.day and b.account_id=p.account_id and b.occurred_at>=p.opened_at and b.ios and b.original>0
        and b.event_name in ('subscription_started','trial_converted','one_time_purchase')))::int as paid
    from paywall p group by p.day
  ), clicks as (
    select ${day(sql`c.created_at`)} as day,count(*)::int as n
    from creator_attribution_clicks c join creator_tracking_links l on l.id=c.tracking_link_id
    join creator_social_accounts a on a.id=l.social_account_id cross join bounds
    where not c.is_bot and c.created_at>=starts and c.created_at<ends and a.creator_profile_id not in (${excluded}) group by 1
  ), daily as (
    select d.day,coalesce(m.revenue,0) as revenue,coalesce(m.ios,0) as ios,coalesce(m.web,0) as web,
      coalesce(m.renewals,0) as "iosRenewals",coalesce(m.sales,0) as "iosSales",coalesce(n.paid,0) as "paidSubscriptions",
      coalesce(m.missing,0) as "missingUsd",coalesce(c.submissions,0) as submissions,coalesce(c.views,0) as "cohortViews",
      e.views as "estimatedViews",coalesce(e.posts,0) as "estimatedPosts",
      t.views as "measuredViews",coalesce(t.posts,0) as "measuredPosts",coalesce(o.n,0) as "firstOpens",coalesce(k.n,0) as clicks,
      coalesce(f.accounts,0) as "paywallAccounts",coalesce(f.paid,0) as "paidAfterPaywall"
    from days d left join money m using(day) left join cohorts c using(day) left join tracked t using(day) left join estimated e using(day)
    left join opens o using(day) left join subscription_counts n using(day) left join conversions f using(day) left join clicks k using(day)
  ) select json_build_object('daily',(select json_agg(d order by day) from daily d),
    'mix',coalesce((select json_agg(b order by day,basis,campaign,country nulls first) from breakdown b),'[]'::json),
    'tiers',coalesce((select json_agg(t order by day,basis,campaign) from tier_rows t),'[]'::json),
    'recordings',coalesce((select json_agg(r order by day desc,campaign,title) from ocr_pairs r),'[]'::json)) as report`
}
