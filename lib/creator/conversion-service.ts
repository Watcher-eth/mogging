import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { ApiError } from "@/lib/api/http";
import { EMPTY_CREATOR_CONVERSION_REPORT, type CreatorConversionReport } from "./conversion-report";

export async function getCreatorConversionReport(userId: string): Promise<CreatorConversionReport> {
  const profile = await db.query.creatorProfiles.findFirst({ columns: { id: true, authStatus: true }, where: eq(schema.creatorProfiles.userId, userId) });
  if (!profile) return EMPTY_CREATOR_CONVERSION_REPORT;
  if (profile.authStatus === "suspended") throw new ApiError(403, "Creator access required");
  // Allocate at the original click time, never at payment time. Audit timestamps
  // prevent a later review from filling an expired gap or reweighting old traffic.
  // Shared-link weights are estimates: 24-hour recency half-life, 48-hour cutoff.
  // They deliberately do not use today's lifetime views to explain older clicks.
  const [result] = await db.execute<{ report: CreatorConversionReport }>(sql`
    with own_posts as materialized (
      select p.id, p.social_account_id, p.title, p.platform, p.post_url, p.posted_at,
        coalesce((select min(u.created_at) from creator_submission_updates u
          where u.submission_id = p.id and u.type = 'submitted'), p.created_at) as submitted_at
      from creator_submissions p where p.creator_profile_id = ${profile.id} and not p.is_draft
    ), activity as materialized (
      select id as submission_id, coalesce(posted_at, submitted_at) as at from own_posts
      union
      select u.submission_id, u.created_at from creator_submission_updates u
      join own_posts p on p.id = u.submission_id
      where u.type in ('rereview_requested', 'approved') and u.created_at >= coalesce(p.posted_at, p.submitted_at)
    ), own_links as (
      select l.id, l.social_account_id from creator_tracking_links l
      join creator_social_accounts a on a.id = l.social_account_id
      where a.creator_profile_id = ${profile.id}
    ), own_clicks as materialized (
      select c.id, c.tracking_link_id, c.source, c.submission_id, c.created_at, l.social_account_id
      from creator_attribution_clicks c join own_links l on l.id = c.tracking_link_id
      where not c.is_bot
    ), candidates as (
      select c.id as click_id, p.id as submission_id, c.submission_id is null as estimated,
        power(0.5::numeric, extract(epoch from (c.created_at - max(a.at))) / 86400) as score
      from own_clicks c join own_posts p on
        (c.submission_id = p.id or (c.submission_id is null and p.social_account_id = c.social_account_id))
      join activity a on a.submission_id = p.id and a.at <= c.created_at
        and a.at > c.created_at - interval '48 hours'
      group by c.id, p.id, c.submission_id, c.created_at
    ), weights as materialized (
      select click_id, submission_id, estimated, score / sum(score) over(partition by click_id) as weight
      from candidates
    ), own_events as materialized (
      select e.id, e.click_id, e.event_type, e.amount_cents, e.currency, e.mobile_install_id,
        e.created_at, coalesce(e.user_id, e.attribution_key) as customer_key,
        c.id as owned_click_id
      from creator_attribution_events e join own_links l on l.id = e.tracking_link_id
      left join own_clicks c on c.id = e.click_id and c.tracking_link_id = e.tracking_link_id
      where lower(coalesce(e.metadata->>'environment', 'production')) != 'sandbox'
        and not exists(select 1 from users u where u.id = e.user_id and u.analytics_internal)
        and not exists(select 1 from creator_attribution_clicks bot where bot.id = e.click_id and bot.is_bot)
    ), first_installs as (
      select distinct on (coalesce(mobile_install_id, customer_key)) id from own_events
      where event_type = 'install' and coalesce(mobile_install_id, customer_key) is not null
      order by coalesce(mobile_install_id, customer_key), created_at, id
    ), first_customers as (
      select distinct on (customer_key) id from own_events
      where event_type = 'payment' and amount_cents > 0 and customer_key is not null
      order by customer_key, created_at, id
    ), daily_activity as (
      select c.created_at::date as day, 1 as presses, 0 as downloads, 0 as conversions, 0::bigint as revenue
      from own_clicks c where c.source = 'browser'
      union all
      select e.created_at::date, 0, case when i.id is not null then 1 else 0 end,
        case when buyer.id is not null then 1 else 0 end,
        case when upper(e.currency) = 'USD' and e.event_type in ('payment','refund','dispute')
          then coalesce(e.amount_cents,0) else 0 end
      from own_events e left join first_installs i on i.id = e.id
      left join first_customers buyer on buyer.id = e.id
    ), daily_totals as (
      select day, sum(presses) as presses, sum(downloads) as downloads,
        sum(conversions) as conversions, sum(revenue) / 100.0 as revenue
      from daily_activity group by day
    ), days as (
      select generate_series(
        least((select min(day) from daily_totals), timezone('UTC',now())::date - 6),
        greatest((select max(day) from daily_totals), timezone('UTC',now())::date), interval '1 day')::date as day
      where exists(select 1 from daily_totals)
    ), credits as (
      select w.submission_id, coalesce(w.estimated, false) as estimated,
        coalesce(w.weight, 1) as presses, 0::numeric as downloads, 0::numeric as conversions, 0::numeric as revenue
      from own_clicks c left join weights w on w.click_id = c.id where c.source = 'browser'
      union all
      select w.submission_id, coalesce(w.estimated, false), 0,
        case when i.id is not null then coalesce(w.weight, 1) else 0 end,
        case when buyer.id is not null then coalesce(w.weight, 1) else 0 end,
        case when upper(e.currency) = 'USD' and e.event_type in ('payment','refund','dispute')
          then coalesce(e.amount_cents,0) * coalesce(w.weight,1) else 0 end
      from own_events e left join weights w on w.click_id = e.owned_click_id
      left join first_installs i on i.id = e.id left join first_customers buyer on buyer.id = e.id
    ), metrics as (
      select submission_id,
        jsonb_build_object('linkPresses',sum(presses),'downloads',sum(downloads),
          'conversions',sum(conversions),'revenueCents',sum(revenue)) as combined,
        jsonb_build_object('linkPresses',coalesce(sum(presses) filter(where not estimated),0),
          'downloads',coalesce(sum(downloads) filter(where not estimated),0),
          'conversions',coalesce(sum(conversions) filter(where not estimated),0),
          'revenueCents',coalesce(sum(revenue) filter(where not estimated),0)) as direct,
        jsonb_build_object('linkPresses',coalesce(sum(presses) filter(where estimated),0),
          'downloads',coalesce(sum(downloads) filter(where estimated),0),
          'conversions',coalesce(sum(conversions) filter(where estimated),0),
          'revenueCents',coalesce(sum(revenue) filter(where estimated),0)) as estimated
      from credits group by submission_id
    ), paid as (
      select submission_id, sum(amount_cents)::bigint as cents from creator_payments
      where creator_profile_id = ${profile.id} and status = 'paid' and upper(currency) = 'USD'
      group by submission_id
    ), zero as (
      select '{"linkPresses":0,"downloads":0,"conversions":0,"revenueCents":0}'::jsonb as metrics
    )
    select jsonb_build_object(
      'bonusesAvailable', exists(select 1 from creator_sprints
        where status = 'published' and starts_at <= timezone('UTC',now()) and ends_at > timezone('UTC',now())
          and coalesce((terms->>'bonusBudgetCents')::int,0) > 0),
      'daily', coalesce((select jsonb_agg(jsonb_build_object(
        'day',to_char(days.day,'YYYY-MM-DD'),'linkPresses',coalesce(d.presses,0),
        'downloads',coalesce(d.downloads,0),'conversions',coalesce(d.conversions,0),
        'revenue',coalesce(d.revenue,0)
      ) order by days.day) from days left join daily_totals d using(day)),'[]'::jsonb),
      'totals', jsonb_build_object(
        'linkPresses', (select count(*) from own_clicks where source = 'browser'),
        'downloads', (select count(*) from first_installs),
        'conversions', (select count(*) from first_customers),
        'revenueCents', (select coalesce(sum(amount_cents),0) from own_events where upper(currency) = 'USD' and event_type in ('payment','refund','dispute'))
      ),
      'unassigned', coalesce((select combined from metrics where submission_id is null),(select metrics from zero)),
      'videos', coalesce((select jsonb_agg(
        coalesce(m.combined,(select metrics from zero)) || jsonb_build_object(
          'id',p.id,'title',p.title,'platform',p.platform,'postUrl',p.post_url,
          'postedAt',p.posted_at,'submittedAt',p.submitted_at,
          'attributionExpiresAt',(select max(at) + interval '48 hours' from activity where submission_id=p.id and at <= timezone('UTC',now())),
          'direct',coalesce(m.direct,(select metrics from zero)),
          'estimated',coalesce(m.estimated,(select metrics from zero)),
          'paidAmountCents',coalesce(paid.cents,0)
        ) order by p.submitted_at desc) from own_posts p
        left join metrics m on m.submission_id=p.id left join paid on paid.submission_id=p.id),'[]'::jsonb)
    ) as report
  `);
  return result?.report ?? EMPTY_CREATOR_CONVERSION_REPORT;
}
