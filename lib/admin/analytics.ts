import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { trackingDefinitions, trackingDimensions } from './tracking'
import { ONBOARDING_ANALYTICS_VERSION, onboardingAnalyticsSteps } from '@/lib/analytics/onboarding'

export const analyticsFilters = z.object({
  days: z.enum(['7', '30', '90']).default('30'),
  platform: z.enum(['all', 'web', 'ios', 'android']).default('all'),
})
export type AnalyticsFilters = z.infer<typeof analyticsFilters>
export type MetricRow = Record<string, string | number | null>
export type AnalyticsDashboard = {
  generatedAt: string; queryMs: number; filters: AnalyticsFilters
  summary: { events: number; actors: number; first_opens: number; evaluations: number; failures: number; latest_event: string | null }
  onboarding: Array<{ name: string; actors: number }>
  paywall: Array<{ name: string; actors: number }>
  web: Array<{ name: string; actors: number }>
  daily: MetricRow[]; acquisition: MetricRow[]; steps: MetricRow[]; screens: MetricRow[]
  onboardingScreens: MetricRow[]; onboardingFriction: MetricRow[]
  billing: MetricRow[]; revenue: MetricRow[]; revenueDaily: MetricRow[]; retention: MetricRow[]; cancellations: MetricRow[]
  actions: MetricRow[]; releases: MetricRow[]
  eventMetrics: MetricRow[]; eventPlatforms: MetricRow[]; dimensions: MetricRow[]; billingProducts: MetricRow[]; billingDimensions: MetricRow[]; contextCoverage: MetricRow[]; eventDelivery: MetricRow[]
}

// All identifiers here are constants owned by this module, never request input.
function funnel(name: string, events: string[], platform: SQL) {
  const ctes = events.map((event, index) => {
    const current = sql.identifier(`${name}${index}`)
    const previous = sql.identifier(`${name}${index - 1}`)
    return index === 0
      ? sql`${current} as (select actor, min(occurred_at) as at, min(occurred_at) as started
          from e where event_name = ${event} and ${platform} and actor is not null group by actor)`
      : sql`${current} as (select e.actor, min(e.occurred_at) as at, p.started from e
          join ${previous} p on p.actor = e.actor
          where e.event_name = ${event} and ${platform} and e.occurred_at >= p.at
            and e.occurred_at <= p.started + interval '7 days' group by e.actor, p.started)`
  })
  const result = sql`json_build_array(${sql.join(events.map((event, index) =>
    sql`json_build_object('name', ${event}::text, 'actors', (select count(*) from ${sql.identifier(`${name}${index}`)}))`), sql`,`)})`
  return { ctes, result }
}

export function analyticsQuery(filters: AnalyticsFilters, now: Date) {
  const start = new Date(now.getTime() - Number(filters.days) * 86400_000).toISOString()
  const end = now.toISOString()
  const platform = filters.platform === 'all' ? sql`true` : sql`platform = ${filters.platform}`
  const onboarding = funnel('onboarding', ['onboarding_started', 'paywall_viewed', 'purchase_completed', 'evaluation_completed', 'report_viewed'], sql`platform in ('ios','android')`)
  const paywall = funnel('paywall', ['paywall_viewed', 'plan_selected', 'purchase_started', 'purchase_completed'], sql`platform in ('ios','android')`)
  const web = funnel('web', ['page_viewed', 'landing_cta_clicked', 'app_store_redirected'], sql`platform = 'web'`)
  const rows = (name: string) => sql`coalesce((select json_agg(r) from ${sql.identifier(name)} r), '[]'::json)`
  return sql`with e as materialized (
      select event_name, occurred_at, account_id, platform, app_version, properties, session_id, source, schema_version, received_at,
        coalesce('install:' || mobile_install_id, 'anonymous:' || anonymous_id, 'account:' || account_id) as actor
      from analytics_events where environment = 'production'
        and platform in ('web','ios','android')
        and coalesce(properties->>'path', '') not like '/admin%'
        and occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp and ${platform}
    ), reported_events as materialized (
      select * from e union all
      select event_name, occurred_at, account_id, platform, app_version, properties, session_id, source, schema_version, received_at, null::text as actor
      from analytics_events where environment = 'production' and platform = 'server'
        and occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp
    ), event_definitions(section, event) as (values ${sql.join(trackingDefinitions.map(({section, event}) => sql`(${section}::text, ${event}::text)`), sql`,`)}),
    event_metrics as (
      select event_name as event, count(*) as events, count(distinct actor) as actors,
        count(distinct account_id) as accounts, count(distinct session_id) as sessions,
        count(distinct properties->>'attempt_id') as attempts, count(distinct properties->>'flow_id') as flows,
        max(occurred_at) as latest_event,
        round((percentile_cont(0.5) within group (order by case when jsonb_typeof(properties->'duration_ms') = 'number'
          then (properties->>'duration_ms')::numeric end) filter (where jsonb_typeof(properties->'duration_ms') = 'number'
          and (properties->>'duration_ms')::numeric between 0 and 1800000))::numeric) as median_ms,
        round((percentile_cont(0.9) within group (order by case when jsonb_typeof(properties->'duration_ms') = 'number'
          then (properties->>'duration_ms')::numeric end) filter (where jsonb_typeof(properties->'duration_ms') = 'number'
          and (properties->>'duration_ms')::numeric between 0 and 1800000))::numeric) as p90_ms
      from reported_events group by event_name order by events desc
    ), event_platforms as (
      select event_name as event, platform, coalesce(source,'unknown') as source, count(*) as events,
        count(distinct actor) as actors, count(distinct account_id) as accounts
      from reported_events group by 1,2,3 order by events desc limit 300
    ), event_delivery as (
      select platform,coalesce(app_version,'unknown') as release,schema_version,count(*) as events,
        count(*) filter(where received_at < occurred_at) as clock_skew_events,
        round((percentile_cont(0.5) within group(order by extract(epoch from (received_at-occurred_at))*1000)
          filter(where received_at >= occurred_at))::numeric) as median_ms,
        round((percentile_cont(0.9) within group(order by extract(epoch from (received_at-occurred_at))*1000)
          filter(where received_at >= occurred_at))::numeric) as p90_ms
      from reported_events group by 1,2,3 order by events desc limit 100
    ), dimension_counts as (
      select case when p.key like '%utm_%' or p.key in ('campaign_id','creative_id','paidMedia','referrer_host') then 'Acquisition' else d.section end as section, e.event_name as event, p.key as dimension, p.value, count(*) as events, count(distinct e.actor) as actors
      from reported_events e join event_definitions d on d.event = e.event_name
        cross join lateral jsonb_each_text(e.properties) p
      where p.key in (${sql.join(trackingDimensions.map(key => sql`${key}`), sql`,`)}) and p.value is not null
        and jsonb_typeof(e.properties->p.key) in ('string','number','boolean')
      group by 1,2,3,4
    ), dimensions as (
      select section, event, dimension, value, events, actors from (
        select *, row_number() over (partition by section, dimension order by events desc, event, value) as rank
        from dimension_counts
      ) ranked where rank <= 20 order by section, dimension, events desc, event, value
    ), context_coverage as (
      select f.field, count(*) filter(where nullif(e.properties->>f.field,'') is not null) as events,
        count(distinct e.actor) filter(where nullif(e.properties->>f.field,'') is not null) as actors,
        count(distinct e.properties->>f.field) as unique_ids
      from (values ('appsflyer_id'),('creator_click_id'),('creator_tracking_link_id'),('creator_first_tracking_link_id'),('flow_id'),('attempt_id'),('report_id'),('evaluation_id')) f(field)
      left join e on true group by f.field order by f.field
    ), b as materialized (
      select * from subscription_events where environment = 'production'
        and occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp
    ), ${sql.join([...onboarding.ctes, ...paywall.ctes, ...web.ctes], sql`,`)},
    daily as (
      select to_char(occurred_at, 'YYYY-MM-DD') as day, count(distinct actor) as actors,
        count(*) filter (where event_name = 'evaluation_completed') as evaluations,
        count(*) filter (where event_name = 'evaluation_started') as scan_starts,
        count(*) filter (where event_name = 'purchase_completed') as purchase_completions,
        count(distinct actor) filter (where event_name = 'app_first_open') as first_opens,
        count(*) filter (where event_name = 'app_store_redirected') as store_redirects,
        count(*) filter (where event_name = 'paywall_viewed') as paywall_views,
        count(*) filter (where event_name = 'purchase_started') as purchase_starts,
        count(*) filter (where event_name = 'evaluation_failed') as failures,
        count(*) filter (where event_name = 'report_viewed') as report_views,
        count(*) filter (where event_name = 'protocol_task_completed') as protocol_tasks
      from e group by 1 order by 1
    ), acquisition as (
      select coalesce(nullif(properties->>'creator_first_tracking_link_id', ''), nullif(properties->>'first_utm_source', ''), 'unknown') as source,
        coalesce(nullif(properties->>'first_utm_campaign', ''), '—') as campaign,
        count(distinct actor) as actors,
        count(distinct actor) filter (where event_name = 'app_first_open') as first_opens,
        count(distinct actor) filter (where event_name = 'app_store_redirected') as store_redirects,
        count(distinct actor) filter (where event_name = 'purchase_completed') as purchase_actors
      from e group by 1,2 order by actors desc limit 50
    ), onboarding_definitions(step, label, position) as (values ${sql.join(onboardingAnalyticsSteps.map(([step, label], index) => sql`(${step}::text, ${label}::text, ${index}::integer)`), sql`,`)}),
    onboarding_observations as materialized (
      select e.actor, e.properties->>'flow_id' as flow_id, d.step, d.position, e.occurred_at,
        e.event_name, case when jsonb_typeof(e.properties->'duration_ms') = 'number'
          then (e.properties->>'duration_ms')::numeric end as duration_ms
      from e join onboarding_definitions d on d.step = e.properties->>'step'
      where e.platform in ('ios','android') and e.actor is not null
        and nullif(e.properties->>'flow_id', '') is not null
        and e.properties->>'onboarding_version' = ${ONBOARDING_ANALYTICS_VERSION}
        and e.event_name in ('onboarding_step_viewed','onboarding_step_exited','onboarding_step_back')
    ), onboarding_forward_events as materialized (
      select actor, flow_id, position, occurred_at as at from onboarding_observations
      where event_name = 'onboarding_step_viewed'
      union all
      select actor, properties->>'flow_id', ${onboardingAnalyticsSteps.length}::integer, occurred_at from e
      where event_name = 'evaluation_completed' and platform in ('ios','android')
        and properties->>'onboarding_version' = ${ONBOARDING_ANALYTICS_VERSION}
        and actor is not null and nullif(properties->>'flow_id', '') is not null
    ), onboarding_timelines as (
      select actor, flow_id, array_agg(position) as positions, array_agg(at) as times
      from onboarding_forward_events group by actor, flow_id
    ), onboarding_progress as (
      select t.actor, t.flow_id, d.step, v.at, exists (
        select 1 from unnest(t.positions, t.times) n(position, at)
        where n.position > v.position and n.at >= v.at and n.at <= v.at + interval '7 days'
      ) as continued
      from onboarding_timelines t cross join lateral (
        select position, min(at) as at from unnest(t.positions, t.times) n(position, at)
        where position < ${onboardingAnalyticsSteps.length} group by position
      ) v join onboarding_definitions d on d.position = v.position
    ), onboarding_totals as (
      select step, count(*) as viewed, count(*) filter (where continued) as continued,
        count(*) filter (where not continued and at > ${end}::timestamp - interval '7 days') as pending,
        count(*) filter (where at <= ${end}::timestamp - interval '7 days') as mature,
        count(*) filter (where not continued and at <= ${end}::timestamp - interval '7 days') as dropped
      from onboarding_progress group by step
    ), onboarding_durations as (
      select step, round((percentile_cont(0.5) within group (order by duration_ms)
        filter (where event_name = 'onboarding_step_exited' and duration_ms between 0 and 1800000))::numeric) as median_ms,
        count(*) filter (where event_name = 'onboarding_step_back') as back_actions
      from onboarding_observations group by step
    ), onboarding_screens as (
      select d.step, d.label as screen, coalesce(t.viewed, 0) as viewed, coalesce(t.continued, 0) as continued,
        coalesce(t.pending, 0) as pending, coalesce(t.mature, 0) as mature, coalesce(t.dropped, 0) as dropped,
        m.median_ms, coalesce(m.back_actions, 0) as back_actions
      from onboarding_definitions d left join onboarding_totals t using(step)
        left join onboarding_durations m using(step) order by d.position
    ), onboarding_friction as (
      select d.label as screen, e.event_name as event,
        coalesce(e.properties->>'reason_code', e.properties->>'permission', 'unknown') as reason,
        count(distinct e.actor) as affected_devices, count(*) as events
      from e join onboarding_definitions d on d.step = e.properties->>'step'
      where e.platform in ('ios','android') and e.properties->>'onboarding_version' = ${ONBOARDING_ANALYTICS_VERSION}
        and (e.event_name in ('photo_validation_failed','account_auth_failed','purchase_failed','purchase_cancelled','restore_failed','evaluation_failed')
          or (e.event_name = 'permission_result' and e.properties->>'result' = 'denied')
          or (e.event_name = 'consent_result' and e.properties->>'result' = 'declined'))
      group by d.position, d.label, e.event_name, 3 order by d.position, affected_devices desc limit 50
    ), steps as (
      select properties->>'step' as step,
        count(distinct actor) filter (where event_name = 'onboarding_step_viewed') as viewed,
        count(distinct actor) filter (where event_name = 'onboarding_step_completed') as completed,
        count(distinct actor) filter (where event_name = 'onboarding_step_skipped') as skipped,
        count(*) filter (where event_name = 'onboarding_step_back') as back_actions
      from e where event_name like 'onboarding_step_%' group by 1 order by viewed desc limit 50
    ), screens as (
      select coalesce(properties->>'screen', properties->>'path', 'unknown') as screen,
        count(*) as exits,
        round((percentile_cont(0.5) within group (order by case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric end))::numeric) as median_ms,
        round((percentile_cont(0.9) within group (order by case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric end))::numeric) as p90_ms
      from e where event_name in ('screen_exited','page_exited')
        and jsonb_typeof(properties->'duration_ms') = 'number'
        and (case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric end) between 0 and 1800000
      group by 1 order by exits desc limit 30
    ), billing as (
      select provider, provider_type, event_name as event, count(*) as events,
        count(distinct coalesce(account_id, external_user_id)) as customers
      from b group by 1,2,3 order by events desc limit 100
    ), billing_products as (
      select provider, coalesce(product_id,'Unknown product') as product, coalesce(currency,'UNKNOWN') as currency,
        count(*) as events, count(distinct coalesce(account_id, external_user_id)) as customers,
        count(distinct subscription_id) as subscriptions, count(*) filter (where account_id is null) as unlinked_events,
        case when count(amount) > 0 then coalesce(sum(amount) filter(where amount > 0),0)::text end as gross,
        case when count(amount) > 0 then coalesce(-sum(amount) filter(where amount < 0),0)::text end as refunds,
        sum(amount)::text as net, count(*) filter(where amount is null) as missing_amount_events
      from b group by 1,2,3 order by events desc limit 100
    ), billing_dimension_counts as (
      select provider, event_name as event, p.key as dimension, p.value, count(*) as events
      from b cross join lateral jsonb_each_text(properties) p
      where p.key in ('period_type','trial_conversion','store','country','cancel_reason','expiration_reason','new_product_id','offering','offer_code','commission_percentage','tax_percentage','timestamp_estimated')
        and p.value is not null and jsonb_typeof(properties->p.key) in ('string','number','boolean')
      group by 1,2,3,4
    ), billing_dimensions as (
      select provider,event,dimension,value,events from (
        select *,row_number() over(partition by dimension order by events desc,provider,event,value) as rank from billing_dimension_counts
      ) ranked where rank <= 20 order by dimension,events desc
    ), revenue as (
      select coalesce(currency, 'UNKNOWN') as currency,
        coalesce(sum(amount) filter (where amount > 0), 0)::text as gross,
        coalesce(-sum(amount) filter (where amount < 0), 0)::text as refunds,
        coalesce(sum(amount), 0)::text as net,
        count(*) filter (where amount is null) as missing_amount_events
      from b group by 1 order by 1
    ), revenue_daily as (
      select to_char(occurred_at, 'YYYY-MM-DD') as day, coalesce(currency, 'UNKNOWN') as currency,
        case when count(amount) > 0 then coalesce(sum(amount) filter (where amount > 0), 0)::text end as gross,
        case when count(amount) > 0 then coalesce(-sum(amount) filter (where amount < 0), 0)::text end as refunds,
        sum(amount)::text as net,
        count(*) filter (where amount is null) as missing_amount_events
      from b group by 1,2 order by 1,2
    ), activated as (
      select account_id, min(occurred_at) as at from e
      where event_name = 'evaluation_completed' and account_id is not null group by 1
    ), retention as (
      select n.day, count(*) filter (where a.at < ${end}::timestamp - (n.day + 1) * interval '1 day') as eligible,
        count(*) filter (where a.at < ${end}::timestamp - (n.day + 1) * interval '1 day' and exists (
          select 1 from e where e.account_id = a.account_id
            and e.event_name in ('report_viewed','protocol_task_completed','evaluation_completed')
            and e.occurred_at >= a.at + n.day * interval '1 day'
            and e.occurred_at < a.at + (n.day + 1) * interval '1 day'
        )) as retained from (values (1),(7),(30)) n(day) left join activated a on true group by 1 order by 1
    ), cancellation_accounts as (
      select account_id, min(occurred_at) as at from b
      where event_name = 'cancellation_scheduled' and account_id is not null group by 1
    ), cancellations as (
      select case when a.at is null then 'No evaluation observed in window'
        when c.at < a.at then 'Before evaluation'
        when c.at < a.at + interval '1 day' then 'Within 24 hours'
        when c.at < a.at + interval '7 days' then 'Within 7 days'
        else 'Later' end as timing, count(*) as accounts
      from cancellation_accounts c left join activated a using(account_id) group by 1
    ), actions as (
      select event_name as event, count(*) as events, count(distinct actor) as actors from e
      where event_name in ('report_viewed','category_viewed','protocol_viewed','protocol_task_completed',
        'repeat_evaluation_started','share_started','referral_invite_created','push_opened','evaluation_failed','purchase_failed','restore_failed')
      group by 1 order by events desc
    ), releases as (
      select coalesce(app_version, 'unknown') as release, platform,
        count(distinct actor) as actors,
        count(*) filter (where event_name = 'evaluation_started') as evaluations_started,
        count(*) filter (where event_name = 'evaluation_failed') as evaluation_failures,
        round((percentile_cont(0.5) within group (order by case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric end)
          filter (where event_name = 'evaluation_completed' and jsonb_typeof(properties->'duration_ms') = 'number'))::numeric) as median_evaluation_ms
      from e group by 1,2 order by actors desc limit 30
    ) select json_build_object(
      'summary', (select json_build_object('events', count(*), 'actors', count(distinct actor),
        'first_opens', count(distinct actor) filter (where event_name = 'app_first_open'),
        'evaluations', count(*) filter (where event_name = 'evaluation_completed'),
        'failures', count(*) filter (where event_name = 'evaluation_failed'), 'latest_event', max(occurred_at)) from e),
      'onboarding', ${onboarding.result}, 'paywall', ${paywall.result}, 'web', ${web.result},
      'daily', ${rows('daily')}, 'acquisition', ${rows('acquisition')}, 'steps', ${rows('steps')},
      'onboardingScreens', ${rows('onboarding_screens')}, 'onboardingFriction', ${rows('onboarding_friction')}, 'screens', ${rows('screens')}, 'billing', ${rows('billing')}, 'revenue', ${rows('revenue')},
      'revenueDaily', ${rows('revenue_daily')}, 'retention', ${rows('retention')}, 'cancellations', ${rows('cancellations')},
      'actions', ${rows('actions')}, 'releases', ${rows('releases')},
      'eventMetrics', ${rows('event_metrics')}, 'eventPlatforms', ${rows('event_platforms')}, 'dimensions', ${rows('dimensions')},
      'eventDelivery', ${rows('event_delivery')}, 'contextCoverage', ${rows('context_coverage')}, 'billingProducts', ${rows('billing_products')}, 'billingDimensions', ${rows('billing_dimensions')}
    ) as data`
}

// Twelve allowed filter combinations; share concurrent requests, expire after one minute.
const cache = new Map<string, { until: number; promise: Promise<AnalyticsDashboard> }>()
export function getAnalyticsDashboard(filters: AnalyticsFilters) {
  const key = `${filters.days}:${filters.platform}`
  const found = cache.get(key)
  if (found && found.until > Date.now()) return found.promise
  const now = new Date()
  const promise = db.transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '8s'`)
    const [row] = await tx.execute(analyticsQuery(filters, now))
    return { ...(row.data as Omit<AnalyticsDashboard, 'generatedAt' | 'queryMs' | 'filters'>),
      generatedAt: now.toISOString(), queryMs: Date.now() - now.getTime(), filters }
  }).catch(error => { cache.delete(key); throw error })
  cache.set(key, { until: now.getTime() + 60_000, promise })
  return promise
}
