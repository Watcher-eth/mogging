import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

export async function getCreatorCoverage() {
  const [sources, billing, posts, totals, storeCampaigns, mobile] = await Promise.all([
    db.execute(sql`select source, count(*)::int as requests, count(distinct anonymous_actor_id)::int as browser_ids
      from creator_attribution_clicks where not is_bot and created_at >= now() - interval '30 days' group by source`),
    db.execute(sql`select provider, creator_attribution_status as status, count(*)::int as events
      from subscription_events b where environment = 'production' and occurred_at >= now() - interval '30 days'
      and event_name in ('subscription_started','trial_started','subscription_renewed','trial_converted','invoice_paid','one_time_purchase','subscription_refunded')
      and not exists(select 1 from users u where u.id=b.account_id and u.analytics_internal)
      group by provider, creator_attribution_status`),
    db.execute(sql`select s.id,s.title,s.platform,s.is_draft as draft,s.posted_at::text,s.caption is not null as caption_recorded,
        a.handle, count(distinct c.id) filter(where not c.is_bot and c.source='browser')::int as browser_clicks,
        count(distinct e.id) filter(where e.event_type='payment' and e.amount_cents>0)::int as payments,
        count(distinct coalesce(e.user_id,e.attribution_key)) filter(where e.event_type='payment' and e.amount_cents>0)::int as paying_accounts,
        coalesce(sum(e.amount_cents) filter(where upper(e.currency)='USD' and e.event_type in('payment','refund','dispute')),0)::int as usd_net_cents
      from creator_submissions s left join creator_social_accounts a on a.id=s.social_account_id
      left join creator_attribution_clicks c on c.submission_id=s.id
      left join creator_attribution_events e on e.click_id=c.id
        and lower(coalesce(e.metadata->>'environment','production')) <> 'sandbox'
        and not exists(select 1 from users u where u.id=e.user_id and u.analytics_internal)
      where s.created_at >= now() - interval '90 days'
      group by s.id,a.handle order by s.created_at desc limit 200`),
    db.execute(sql`select count(distinct coalesce(e.user_id,e.attribution_key)) filter(where event_type='payment' and amount_cents>0)::int as paying_accounts,
        coalesce(sum(amount_cents) filter(where upper(currency)='USD' and event_type in('payment','refund','dispute')),0)::int as usd_net_cents,
        count(distinct mobile_install_id) filter(where event_type='claim')::int as claimed_installations
      from creator_attribution_events e where lower(coalesce(metadata->>'environment','production')) <> 'sandbox'
        and not exists(select 1 from users u where u.id=e.user_id and u.analytics_internal)`),
    db.execute(sql`select m.campaign,m.day,m.territory,m.downloads,m.sales,m.currency,a.handle,m.imported_at::text
      from creator_store_campaign_metrics m left join creator_tracking_links l on l.id=m.tracking_link_id
      left join creator_social_accounts a on a.id=l.social_account_id
      where m.day >= to_char(now() - interval '90 days','YYYY-MM-DD') order by m.day desc limit 300`),
    db.execute(sql`select m.method,count(*)::int as touches,count(distinct m.mobile_install_id)::int as installations,
        count(distinct m.mobile_install_id) filter(where m.user_id is not null)::int as account_claimed,
        count(distinct m.mobile_install_id) filter(where exists(select 1 from analytics_events a
          where a.mobile_install_id=m.mobile_install_id and a.event_name='app_first_open' and a.environment='production'
          and c.created_at <= a.occurred_at and m.created_at <= a.occurred_at + interval '24 hours'))::int as recovered_first_open_cohort
      from mobile_creator_attributions m join creator_attribution_clicks c on c.id=m.click_id
      where m.created_at >= now() - interval '30 days'
        and not exists(select 1 from users u where u.id=m.user_id and u.analytics_internal)
        and not exists(select 1 from analytics_events a join users u on u.id=a.account_id where u.analytics_internal and a.mobile_install_id=m.mobile_install_id)
      group by m.method`),
  ])
  return { mobile: [...mobile], storeCampaigns: [...storeCampaigns], sources: [...sources], billing: [...billing], posts: [...posts], totals: totals[0] || {} }
}
