import { sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'

export type AnalyticsFactModel = 'overview' | 'web'

// Change the revision whenever the persisted fact contract changes. Readers
// use source events while older days are rebuilt.
const revision = 1
const historyDays = 91
const webServerEvents = ['checkout_started', 'checkout_completed', 'evaluation_request_completed', 'evaluation_request_failed']
const webFields = [
  'action', 'analysis_variant', 'attempt_id', 'browser_family', 'country', 'creator_discount',
  'creator_first_tracking_link_id', 'creator_tracking_link_id', 'currency', 'default_plan',
  'device_platform', 'duration_ms', 'entry_mode', 'experiment_id', 'first_payment_price',
  'first_utm_campaign', 'first_utm_source', 'flow_id', 'flow_version', 'mode', 'offering',
  'path', 'placement', 'plan', 'price', 'product', 'products_loaded', 'purchase_stage',
  'reason_code', 'referrer_host', 'report_id', 'result', 'runtime_environment', 'status',
  'step', 'store_environment', 'surface', 'utm_campaign', 'utm_source', 'variant', 'web_surface',
]

export const analyticsActor = sql`coalesce('install:' || mobile_install_id, 'anonymous:' || anonymous_id, 'account:' || account_id)`
export const analyticsClientEvent = sql`platform in ('web','ios','android')
  and event_name !~ '^(battle|leaderboard)_'
  and coalesce(properties->>'screen','') !~* '(^|/)(battle|leaderboard)(/|[?#]|$)'
  and coalesce(properties->>'path','') !~* '^/(battle|leaderboard)(/|[?#]|$)'`
export const customerClientEvent = sql`event_name <> 'referral_invite_redeemed'
  and coalesce(properties->>'path', '') not like '/admin%'`
export const webServerEvent = sql`platform = 'server' and source is distinct from 'backend'
  and event_name <> 'referral_invite_redeemed'
  and event_name in (${sql.join(webServerEvents.map(event => sql`${event}`), sql`,`)})`

// These are the exact no-flow events used by the D1/D7 account return checks.
export const webMemberActivity = sql`((event_name='page_viewed' and properties->>'path' ~ '^/(app/home|analysis|progress|protocol|r/[^/]+)$')
          or event_name in ('report_viewed','protocol_viewed','progress_viewed','course_viewed')
          or (event_name='screen_viewed' and properties->>'surface'='scan_app'))`

const eventColumns = sql`event_name, occurred_at, platform, environment, source,
  account_id, mobile_install_id, anonymous_id, session_id, properties, event_count`

export function eventFacts(model: AnalyticsFactModel, from: SQL, to: SQL, hours?: SQL) {
  const bounds = sql`occurred_at >= ${from} and occurred_at < ${to}
    ${hours ? sql`and date_trunc('hour',occurred_at) in ${hours}` : sql``}`
  if (model === 'overview') {
    return sql`select event_name, max(occurred_at) as occurred_at, platform, environment, null::text as source,
      account_id, mobile_install_id, anonymous_id, session_id,
      jsonb_strip_nulls(jsonb_build_object('path',properties->>'path','surface',properties->>'surface',
        'runtime_environment',properties->>'runtime_environment','store_environment',properties->>'store_environment')) as properties,
      count(*) as event_count
    from analytics_events
    where ${bounds} and ${analyticsClientEvent}
    group by event_name, date_trunc('hour',occurred_at), platform, environment, account_id, mobile_install_id, anonymous_id, session_id, 10`
  }
  return sql`select event_name, occurred_at, platform, environment, source,
    account_id, mobile_install_id, anonymous_id, session_id,
    coalesce((select jsonb_object_agg(key, value)
      from jsonb_each(properties) where key in (${sql.join(webFields.map(key => sql`${key}`), sql`,`)})), '{}'::jsonb) as properties,
    1::bigint as event_count
  from analytics_events
  where ${bounds} and (
    (platform = 'web' and environment = 'production' and ${analyticsClientEvent} and ${customerClientEvent}
      and (nullif(properties->>'flow_id','') is not null
        or properties->>'path' = '/analysis' or properties->>'surface' = 'web_analysis'
        or (account_id is not null and ${webMemberActivity})))
    or (${webServerEvent})
  )`
}

// Read partial and dirty hours directly. Adjacent gaps are read as one range
// so a cold model never opens a separate raw query for each missing hour.
export function analyticsFactsCTEs(model: AnalyticsFactModel, start: string, end: string) {
  return sql`reporting_hours as materialized (
    select h.hour from analytics_reporting_hours h
    where h.revision = ${revision} and h.hour >= ${start}::timestamp
      and h.hour + interval '1 hour' <= ${end}::timestamp
      and not exists (select 1 from analytics_reporting_changes c where c.hour = h.hour)
  ), reporting_ranges as (
    select h.bucket, h.bucket - row_number() over(order by h.bucket) * interval '1 hour' as island
    from generate_series(date_trunc('hour',${start}::timestamp), ${end}::timestamp, interval '1 hour') h(bucket)
    where h.bucket < ${end}::timestamp and not exists (select 1 from reporting_hours r where r.hour = h.bucket)
  ), reporting_facts as materialized (
    select ${eventColumns} from analytics_reporting_facts
    where model = ${model} and hour in (select hour from reporting_hours)
    union all
    select raw.* from (
      select greatest(min(bucket),${start}::timestamp) as from_at,
        least(max(bucket)+interval '1 hour',${end}::timestamp) as to_at
      from reporting_ranges group by island
    ) r cross join lateral (${eventFacts(model, sql`r.from_at`, sql`r.to_at`)}) raw
  )`
}

export async function refreshAnalyticsReportingFacts(limit = 4, now = new Date()) {
  const refreshed: string[] = []
  for (let i = 0; i < limit; i++) {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`set local statement_timeout = '8s'`)
      await tx.execute(sql`set local lock_timeout = '1s'`)
      const [lock] = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('mogging-analytics-reporting-facts')) as acquired`)
      if (!lock?.acquired) return null

      const cutoff = sql`(${now.toISOString()}::timestamp::date - ${historyDays}::integer)::timestamp`
      if (i === 0) {
        await tx.execute(sql`delete from analytics_reporting_changes where hour < ${cutoff}`)
        await tx.execute(sql`delete from analytics_reporting_facts where hour < ${cutoff}`)
        await tx.execute(sql`delete from analytics_reporting_hours where hour < ${cutoff}`)
      }
      const [next] = await tx.execute<{ day: string, hours: string[] }>(sql`
        select g.hour::date::text as day, array_agg(g.hour::text order by g.hour) as hours
        from generate_series(${cutoff}, date_trunc('hour', ${now.toISOString()}::timestamp) - interval '1 hour', interval '1 hour') g(hour)
        left join analytics_reporting_hours h on h.hour = g.hour and h.revision = ${revision}
        where h.hour is null or exists (select 1 from analytics_reporting_changes c where c.hour = g.hour)
        group by g.hour::date order by g.hour::date desc limit 1`)
      if (!next) return null
      const hours = sql`(${sql.join(next.hours.map(hour => sql`${hour}::timestamp`), sql`,`)})`
      const from = sql`${next.hours[0]}::timestamp`
      const to = sql`${next.hours.at(-1)}::timestamp + interval '1 hour'`
      // An event committing after this delete leaves its own invalidation.
      // Readers will use raw data for that hour until the next refresh.
      await tx.execute(sql`delete from analytics_reporting_changes where hour in ${hours}`)
      await tx.execute(sql`delete from analytics_reporting_facts where hour in ${hours}`)
      await tx.execute(sql`insert into analytics_reporting_facts (hour,model,${eventColumns})
        select date_trunc('hour',occurred_at), 'overview', overview.*
        from (${eventFacts('overview', from, to, hours)}) overview
        union all
        select date_trunc('hour',occurred_at), 'web', web.*
        from (${eventFacts('web', from, to, hours)}) web`)
      await tx.execute(sql`insert into analytics_reporting_hours(hour, revision)
        values ${sql.join(next.hours.map(hour => sql`(${hour}::timestamp,${revision})`), sql`,`)}
        on conflict (hour) do update set revision = excluded.revision`)
      return next.day
    })
    if (!result) break
    refreshed.push(result)
  }
  return refreshed
}
