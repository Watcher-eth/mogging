import postgres from 'postgres'
const original = await Bun.file(new URL('./data.json', import.meta.url)).json()
const { start_utc: start, end_utc: end } = original.window
const sql = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false })
const output: Record<string, unknown> = {}
try {
  await sql.begin('read only', async tx => {
    await tx`set local statement_timeout='45s'`
    output.diagnostics = await tx`select event_name,properties->>'action' as action,
      properties->>'status' as status,properties->>'reason_code' as reason,
      properties->>'provider' as provider,properties->>'delivery' as delivery,
      count(*)::int as events,count(distinct mobile_install_id)::int as installations
      from analytics_events where occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp
      and event_name in('attribution_diagnostic','attribution_link_received','attribution_resolved')
      group by 1,2,3,4,5,6 order by events desc`
    output.alltime_touches = await tx`select count(*)::int as records from mobile_creator_attributions`
    output.post_identity = await tx`select count(*)::int as submissions,
      count(*) filter(where post_key is not null)::int as canonical_post_keys,
      count(*) filter(where sprint_terms is not null)::int as snapshotted_terms
      from creator_submissions where created_at >= ${start}::timestamp and created_at < ${end}::timestamp`
    output.campaign_terms = await tx`select distinct jsonb_build_object('rules',sprint_terms->'rules','formats',sprint_terms->'formats') as terms
      from creator_submissions where created_at >= ${start}::timestamp and created_at < ${end}::timestamp`
    output.creator_concentration = await tx`select count(distinct l.social_account_id)::int as accounts_with_clicks,
      count(distinct a.creator_profile_id)::int as creators_with_clicks,
      count(distinct c.anonymous_actor_id) filter(where not c.is_bot)::int as global_browser_ids,
      count(*) filter(where not c.is_bot and c.anonymous_actor_id is null)::int as no_browser_id_requests
      from creator_attribution_clicks c join creator_tracking_links l on l.id=c.tracking_link_id
      join creator_social_accounts a on a.id=l.social_account_id
      where c.created_at >= ${start}::timestamp and c.created_at < ${end}::timestamp and not c.is_bot`
    output.mobile_billing_identities = await tx`select count(distinct coalesce(account_id,external_user_id))::int as identities
      from subscription_events where occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp
      and environment='production' and provider='revenuecat' and event_name in('one_time_purchase','subscription_started')
      and (account_id is null or account_id not in(select id from users where analytics_internal))`
  })
  await Bun.write(new URL('./followup.json', import.meta.url), JSON.stringify(output, null, 2))
  console.log(JSON.stringify(output))
} finally { await sql.end() }
