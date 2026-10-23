import postgres from 'postgres'

// Run from moggingnew with Bun. All database access is in a read-only snapshot.
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, connect_timeout: 15 })
const output: Record<string, unknown> = {}
try {
  await sql.begin('isolation level repeatable read read only', async tx => {
    await tx`set local statement_timeout = '45s'`
    const [clock] = await tx`select (now() at time zone 'UTC')::text as end_utc,
      ((now() at time zone 'UTC') - interval '7 days')::text as start_utc`
    output.window = clock
    const start = clock.start_utc, end = clock.end_utc
    const queries: Record<string, string> = {
      submissions: `select s.status,s.platform,count(*)::int as submissions,count(distinct s.creator_profile_id)::int as creators,
        count(*) filter(where s.social_account_id is not null)::int as linked_accounts,
        count(*) filter(where s.post_url is not null)::int as post_urls,
        count(*) filter(where s.video_url is not null)::int as video_assets,
        count(*) filter(where s.posted_at is not null)::int as known_post_time,
        count(*) filter(where s.analytics_screenshot_url is not null)::int as analytics_assets,
        sum(coalesce(s.admin_view_count_threshold,s.view_count_threshold,0)) as claimed_or_reviewed_milestone_views,
        sum(coalesce(s.approved_amount_cents,0)) as approved_cents
        from creator_submissions s where s.created_at >= $1::timestamp and s.created_at < $2::timestamp group by 1,2`,
      submission_details: `select s.id,s.title,s.platform,s.status,s.post_url,s.caption,s.format_id,
        s.created_at::text,s.posted_at::text,s.view_count_threshold,s.admin_view_count_threshold,
        s.us_audience_percent,s.admin_us_audience_percent,s.approved_amount_cents,
        s.review_checklist,s.review_note,s.video_url,s.analytics_screenshot_url,
        a.handle,l.slug,l.is_active,s.creator_profile_id,s.social_account_id
        from creator_submissions s left join creator_social_accounts a on a.id=s.social_account_id
        left join creator_tracking_links l on l.social_account_id=a.id
        where s.created_at >= $1::timestamp and s.created_at < $2::timestamp order by s.created_at desc`,
      account_setup: `select a.platform,a.status,a.connection_method,count(*)::int as accounts,
        count(*) filter(where l.id is not null)::int as links,count(*) filter(where l.is_active)::int as active_links,
        count(*) filter(where a.oauth_verified_at is not null)::int as oauth_verified,
        count(*) filter(where a.tiktok_anchor_joined_at is not null)::int as anchor_joined
        from creator_social_accounts a left join creator_tracking_links l on l.social_account_id=a.id
        where a.created_at < $2::timestamp group by 1,2,3`,
      clicks: `select (c.created_at at time zone 'UTC' at time zone 'America/Los_Angeles')::date::text as day,
        count(*)::int as requests,count(*) filter(where not c.is_bot)::int as nonbot_requests,
        count(distinct c.anonymous_actor_id) filter(where not c.is_bot)::int as nonbot_browser_ids,
        count(*) filter(where not c.is_bot and c.user_agent ~* 'TikTok|musical_ly|Bytedance')::int as tiktok_browser,
        count(*) filter(where not c.is_bot and c.user_agent ~* 'Instagram')::int as instagram_browser
        from creator_attribution_clicks c where c.created_at >= $1::timestamp and c.created_at < $2::timestamp group by 1 order by 1`,
      link_activity: `select a.handle,a.platform,l.slug,l.is_active,
        (select count(*)::int from creator_attribution_clicks c where c.tracking_link_id=l.id and not c.is_bot and c.created_at >= $1::timestamp and c.created_at < $2::timestamp) as clicks,
        (select count(distinct c.anonymous_actor_id)::int from creator_attribution_clicks c where c.tracking_link_id=l.id and not c.is_bot and c.created_at >= $1::timestamp and c.created_at < $2::timestamp) as browser_ids,
        (select count(*)::int from mobile_creator_attributions m where m.tracking_link_id=l.id and m.created_at >= $1::timestamp and m.created_at < $2::timestamp) as mobile_touches,
        (select count(*)::int from creator_submissions s where s.social_account_id=a.id and s.created_at >= $1::timestamp and s.created_at < $2::timestamp) as submissions
        from creator_tracking_links l join creator_social_accounts a on a.id=l.social_account_id
        where l.created_at < $2::timestamp order by clicks desc`,
      creator_events: `select event_type,coalesce(metadata->>'environment','production') as environment,
        count(*)::int as events,count(distinct attribution_key)::int as attribution_keys,sum(amount_cents) as cents
        from creator_attribution_events where created_at >= $1::timestamp and created_at < $2::timestamp group by 1,2`,
      touch_summary: `select count(*)::int as touches,count(distinct mobile_install_id)::int as installations,
        count(*) filter(where user_id is not null)::int as account_claimed,
        min(created_at)::text as first_touch,max(created_at)::text as latest_touch from mobile_creator_attributions
        where created_at >= $1::timestamp and created_at < $2::timestamp`,
      manual_metrics: `select count(*)::int as rows,sum(qualified_views) as qualified_views,sum(link_clicks) as clicks,
        sum(installs) as installs,sum(first_time_paid_customers) as paid_customers from creator_attribution_metrics
        where submission_id in(select id from creator_submissions where created_at >= $1::timestamp and created_at < $2::timestamp)`,
      payouts: `select status,currency,count(*)::int as records,sum(amount_cents) as cents
        from creator_payments where created_at >= $1::timestamp and created_at < $2::timestamp group by 1,2`,
      billing: `select provider,environment,event_name,currency,count(*)::int as events,
        count(distinct coalesce(account_id,external_user_id))::int as identities,sum(amount) as amount
        from subscription_events where occurred_at >= $1::timestamp and occurred_at < $2::timestamp
        and (account_id is null or account_id not in(select id from users where analytics_internal)) group by 1,2,3,4`,
      billing_attribution: `select b.provider,b.event_name,b.environment,count(*)::int as events,
        count(*) filter(where exists(select 1 from mobile_creator_attributions m where m.user_id=b.account_id or m.mobile_install_id=b.external_user_id))::int as identity_has_creator_touch,
        count(*) filter(where exists(select 1 from creator_attribution_events c where c.metadata->>'transactionId'=b.transaction_id))::int as transaction_in_creator_ledger
        from subscription_events b where b.occurred_at >= $1::timestamp and b.occurred_at < $2::timestamp
        and b.environment='production' and (b.account_id is null or b.account_id not in(select id from users where analytics_internal)) group by 1,2,3`,
      alltime_creator: `select event_type,count(*)::int as events,min(created_at)::text as first,max(created_at)::text as latest
        from creator_attribution_events where created_at < $2::timestamp group by 1`,
      runtime_versions: `select app_version,count(*)::int as events,count(distinct mobile_install_id)::int as installs,
        count(distinct mobile_install_id) filter(where properties ? 'creator_tracking_link_id')::int as creator_context
        from analytics_events where occurred_at >= $1::timestamp and occurred_at < $2::timestamp and platform='ios'
        and environment='production' group by 1 order by events desc limit 15`,
      diagnostic: `select event_name,properties->>'stage' as stage,properties->>'status' as status,
        properties->>'delivery' as delivery,properties->>'code' as code,count(*)::int as events,
        count(distinct mobile_install_id)::int as installs
        from analytics_events where occurred_at >= $1::timestamp and occurred_at < $2::timestamp
        and (event_name like '%attribution%' or event_name like '%creator_code%') group by 1,2,3,4,5 order by events desc`,
      customer_events: `with internal_accounts as (select id from users where analytics_internal),
        internal_identities as materialized (select distinct mobile_install_id,anonymous_id from analytics_events where account_id in(select id from internal_accounts)),
        sandbox_transactions as (select transaction_id from subscription_events where environment='sandbox' and transaction_id is not null
          except select transaction_id from subscription_events where environment='production' and transaction_id is not null),
        sandbox_sessions as (select distinct session_id from analytics_events where session_id is not null and
          (properties->>'runtime_environment'='sandbox' or properties->>'store_environment'='sandbox' or properties->>'transaction_id' in(select transaction_id from sandbox_transactions)))
        select platform,event_name,count(*)::int as events,count(distinct mobile_install_id)::int as installations,
          count(distinct mobile_install_id) filter(where nullif(properties->>'creator_tracking_link_id','') is not null)::int as creator_context,
          count(distinct mobile_install_id) filter(where nullif(properties->>'appsflyer_id','') is not null)::int as appsflyer_context
        from analytics_events where occurred_at >= $1::timestamp and occurred_at < $2::timestamp
          and environment='production'
          and (account_id is null or account_id not in(select id from internal_accounts))
          and (mobile_install_id is null or mobile_install_id not in(select mobile_install_id from internal_identities where mobile_install_id is not null))
          and (anonymous_id is null or anonymous_id not in(select anonymous_id from internal_identities where anonymous_id is not null))
          and coalesce(properties->>'runtime_environment','') not in('sandbox','development','test')
          and coalesce(properties->>'store_environment','') <> 'sandbox'
          and (session_id is null or session_id not in(select session_id from sandbox_sessions))
          and coalesce(properties->>'path','') !~ '^/(creator|admin)(/|$)'
          and coalesce(properties->>'surface','') not in('creator_portal','creator_dashboard')
        group by 1,2 order by events desc`,
    }
    for (const [name, query] of Object.entries(queries)) {
      output[name] = query.includes('$1')
        ? await tx.unsafe(query, [start, end])
        : await tx.unsafe(query.replaceAll('$2', '$1'), [end])
      console.log(name, JSON.stringify(output[name]).length)
    }
  })
  await Bun.write(new URL('./data.json', import.meta.url), JSON.stringify(output, null, 2))
} finally { await sql.end() }
