import { revenueReportCTEs } from './revenue-report'
import { notificationsCTEs, ledgerCTEs, dataHealthCTEs, type NotificationsData, type LedgerData, type DataHealthData } from './operations-analytics'
import { getReliabilityData, type ReliabilityData } from './reliability'
import { referralsCTEs, type ReferralsReport } from './referrals-query'
import { engagementCTEs, type EngagementReport } from './engagement-query'
import { scansCTEs, type ScansReport } from './scans-query'
import { purchaseFlowCTEs, type PurchaseFlowReport } from './purchase-flow-query'
import { authenticationCTEs, type AuthenticationReport } from './authentication-query'
import { creatorEconomicsCTEs, type CreatorEconomicsReport } from './creator-economics-query'
import { getCreatorPerformanceSnapshot, type CreatorPerformanceSnapshot } from './creator-performance-snapshot'
import { creatorAttributionCTEs, type CreatorAttributionData } from './creator-attribution-query'
import { audienceCTEs, eventAudience, customerEvent, customerAccount } from './audience'
import { landingExperiments } from '@/lib/analytics/landing'
import { excludedAcquisitionHost } from '@/lib/analytics/acquisition'
import { sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { trackingDefinitions, trackingDimensions } from './tracking'
import { scanProducts } from '@/lib/payments/revenuecat'
import { onboardingAnalyticsSteps, supportedOnboardingVersions } from '@/lib/analytics/onboarding'
import { reportingBucket } from './reporting-bucket'
import { ADMIN_REPORTING_TIME_ZONE } from './reporting-time'

export const analyticsFilters = z.object({
  days: z.enum(['1', '7', '30', '90']).default('7'),
  section: z.enum(['Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability']).optional(),
  platform: z.enum(['all', 'web', 'ios', 'android']).default('all'),
})
export type AnalyticsFilters = z.infer<typeof analyticsFilters>
// Only money-bearing events can have an unknown monetary amount. Stripe invoices
// own subscription revenue; checkout expiry, declines and status updates do not.
const monetaryBillingEvent = sql`(
  (provider = 'stripe' and event_name in ('one_time_purchase','invoice_paid','subscription_renewed','subscription_refunded'))
  or (provider = 'revenuecat' and event_name in ('subscription_started','subscription_renewed','trial_converted','one_time_purchase','refund_reversed','subscription_refunded'))
)`

const contextFields = ['appsflyer_id','creator_click_id','creator_tracking_link_id','creator_first_tracking_link_id','flow_id','attempt_id','report_id','evaluation_id']

const subscriptionLifecycleEvents = [
  'subscription_started', 'trial_started', 'trial_converted', 'invoice_paid', 'subscription_renewed',
  'cancellation_scheduled', 'subscription_pause_scheduled', 'subscription_expired', 'subscription_refunded',
  'subscription_reactivated', 'subscription_updated', 'subscription_extended', 'subscription_product_changed',
  'billing_issue_started', 'refund_reversed',
]

export type MetricRow = Record<string, string | number | null>
export type AnalyticsDashboard = {
  audienceBreakdown?: MetricRow[]
  generatedAt: string; queryMs: number; filters: AnalyticsFilters
  summary: { events: number; actors: number; first_opens: number; evaluations: number; failures: number; latest_event: string | null }
  onboarding: Array<{ name: string; actors: number }>
  paywall: Array<{ name: string; actors: number }>
  web: Array<{ name: string; actors: number }>
  landingHandoffs?: MetricRow[]; webAudience?: MetricRow[]; landingExperiments: MetricRow[]; landingSections: MetricRow[]; landingSources: MetricRow[]; landingPlacements: MetricRow[]
  daily: MetricRow[]; acquisition: MetricRow[]; steps: MetricRow[]; screens: MetricRow[]
  acquisitionSummary?: MetricRow[]; landingSummary?: MetricRow[]
  landingExperimentDaily?: MetricRow[]
  onboardingSummary?: MetricRow[]; onboardingDaily?: MetricRow[]
  onboardingScreens: MetricRow[]; onboardingFriction: MetricRow[]
  revenueTotals?: MetricRow[]; revenueActivity?: MetricRow[]
  revenueComparison?: MetricRow[]; billingReporting?: MetricRow[]
  revenueFinancials?: MetricRow[]; revenueSources?: MetricRow[]; revenueCountries?: MetricRow[]; revenueProceedsDaily?: MetricRow[]
  revenueSubscriptionOverview?: MetricRow[]; revenueSubscriptionProducts?: MetricRow[]
  billing: MetricRow[]; revenue: MetricRow[]; revenueDaily: MetricRow[]; retention: MetricRow[]; cancellations: MetricRow[]
  actions: MetricRow[]; releases: MetricRow[]
  eventMetrics: MetricRow[]; eventPlatforms: MetricRow[]; dimensions: MetricRow[]; billingProducts: MetricRow[]; billingDimensions: MetricRow[]; contextCoverage: MetricRow[]; eventDelivery: MetricRow[]
  scanLedger: { summary: { started: number; completed: number; failed: number; pending: number; reports: number }; daily: MetricRow[] }
  reportLedger: { summary: { completed: number; failed: number; other: number }; daily: MetricRow[] }
  onboardingRevisions: MetricRow[]
  notifications?: NotificationsData | null
  attributionLedger?: LedgerData | null
  dataHealth?: DataHealthData | null
  reliability?: ReliabilityData
  referrals?: ReferralsReport | null
  engagement?: EngagementReport | null
  scans?: ScansReport | null
  purchaseFlow?: PurchaseFlowReport | null
  authentication?: AuthenticationReport | null
  creatorEconomics?: CreatorEconomicsReport | null
  creatorPerformance?: CreatorPerformanceSnapshot
  creatorAttribution?: CreatorAttributionData | null
  retentionWeekly?: MetricRow[]; retentionCoverage?: MetricRow[]
  featureUsage?: MetricRow[]; featureRetention?: MetricRow[]
  paidDelivery?: MetricRow[]; membershipActivation?: MetricRow[]
}

// All identifiers here are constants owned by this module, never request input.
function funnel(name: string, events: string[], platform: SQL) {
  const ctes = events.flatMap((event, index) => {
    const current = sql.identifier(`${name}${index}`)
    const previous = sql.identifier(`${name}${index - 1}`)
    const observations = sql.identifier(`${name}_events${index}`)
    // Filter once before joining actors; rescanning the full event snapshot per
    // actor makes the reporting window increasingly expensive as traffic grows.
    return [sql`${observations} as materialized (
      select actor, occurred_at from e where event_name = ${event} and ${platform} and actor is not null
    )`, index === 0
      ? sql`${current} as (select actor, min(occurred_at) as at, min(occurred_at) as started
          from ${observations} group by actor)`
      : sql`${current} as (select e.actor, min(e.occurred_at) as at, p.started from ${observations} e
          join ${previous} p on p.actor = e.actor
          where e.occurred_at >= p.at
            and e.occurred_at <= p.started + interval '7 days' group by e.actor, p.started)`]
  })
  const result = sql`json_build_array(${sql.join(events.map((event, index) =>
    sql`json_build_object('name', ${event}::text, 'actors', (select count(*) from ${sql.identifier(`${name}${index}`)}))`), sql`,`)})`
  return { ctes, result }
}

// Only reference the selected page's aggregates. PostgreSQL skips unreferenced
// CTEs, so an acquisition visit never computes retention or billing cohorts.
const sectionReports: Record<NonNullable<AnalyticsFilters['section']>, readonly string[]> = {
  Overview: ['daily', 'scanLedger', 'paid_delivery'],
  Acquisition: ['daily', 'acquisition', 'acquisition_summary', 'landing_summary', 'web_audience', 'landing_sections', 'landing_placements', 'landing_sources'],
  Experiments: ['landing_handoffs', 'landing_experiments', 'landing_experiment_daily'],
  Onboarding: ['onboarding_summary', 'onboarding_daily', 'onboarding', 'onboarding_screens', 'onboarding_friction', 'onboarding_revisions', 'steps', 'screens'],
  Revenue: ['revenue_financials', 'revenue_sources', 'revenue_countries', 'revenue_proceeds_daily', 'revenue_subscription_overview', 'revenue_subscription_products', 'revenue', 'revenue_totals', 'revenue_comparison', 'revenue_activity', 'revenue_daily', 'billing', 'billing_products', 'billing_dimensions', 'billing_reporting'],
  CreatorAttribution: ['creator_attribution'],
  CreatorPerformance: [],
  CreatorEconomics: ['creator_economics'],
  Retention: ['feature_retention', 'membership_activation', 'retention', 'retention_weekly', 'retention_coverage'],
  Authentication: ['daily', 'authentication'],
  Purchases: ['purchase_flow'],
  Scans: ['scans'],
  Engagement: ['engagement'],
  Referrals: ['referrals'],
  Notifications: ['notifications'],
  AttributionLedger: ['attribution_ledger'],
  Quality: ['data_health'],
  Reliability: [],
}
const eventReportSections = new Set(['Acquisition', 'Onboarding'])

export function analyticsQuery(filters: AnalyticsFilters, now: Date) {
  if (['Onboarding','Purchases'].includes(filters.section ?? '') && filters.platform === 'web') filters = { ...filters, platform: 'all' }
  const start = new Date(now.getTime() - Number(filters.days) * 86400_000).toISOString()
  const end = now.toISOString()
  const platform = ['Scans','Referrals','Notifications','AttributionLedger','Quality','Reliability'].includes(filters.section ?? '') || filters.platform === 'all' ? sql`true` : sql`platform = ${filters.platform}`
  const supportedOnboarding = sql`e.properties->>'onboarding_version' in (${sql.join(supportedOnboardingVersions.map(version => sql`${version}`), sql`,`)})`
  const onboarding = funnel('onboarding', ['onboarding_started', 'paywall_viewed', 'purchase_completed', 'evaluation_completed', 'report_viewed'], sql`platform in ('ios','android')`)
  // A default plan can be purchased without an explicit plan-selection event.
  const paywall = funnel('paywall', ['paywall_viewed', 'purchase_started', 'purchase_completed'], sql`platform in ('ios','android')`)
  const web = funnel('web', ['page_viewed', 'app_store_redirected'], sql`platform = 'web' and properties->>'path' = '/'`)
  const reportEvents = filters.section && eventReportSections.has(filters.section)
    ? trackingDefinitions.filter(definition => definition.section === filters.section).map(definition => definition.event) : null
  const eventReportFilter = reportEvents ? sql`event_name in (${sql.join(reportEvents.map(event => sql`${event}`), sql`,`)})` : sql`true`
  const dimensionSection = sql`case when p.key like '%utm_%' or p.key in ('campaign_id','creative_id','paidMedia','referrer_host') then 'Acquisition' else d.section end`
  const contextDefinitions = sql.join(contextFields.map(field => sql`(${field}::text)`), sql`,`)
  const reports = filters.section ? new Set(['audience_breakdown', ...sectionReports[filters.section]]) : null
  if (filters.section && eventReportSections.has(filters.section)) {
    for (const name of ['event_metrics', 'event_platforms', 'context_coverage']) reports!.add(name)
  }
  const include = (name: string, query: SQL, fallback = sql`'[]'::json`) => !reports || reports.has(name) ? query : fallback
  const rows = (name: string) => include(name, sql`coalesce((select json_agg(r) from ${sql.identifier(name)} r), '[]'::json)`)
  const referrer = sql`coalesce(nullif(properties->>'first_referrer_host',''),nullif(properties->>'referrer_host',''))`
  const acquisitionSource = sql`coalesce(nullif(properties->>'creator_first_tracking_link_id',''),
    nullif(properties->>'first_utm_source',''), nullif(properties->>'utm_source',''),
    case when ${referrer} !~* ${excludedAcquisitionHost} then ${referrer} end)`
  // Split the final JSON payload to stay below PostgreSQL's 100-argument function limit.
  return sql`with ${audienceCTEs()}, scoped_events as materialized (
      select a.event_name, a.occurred_at, a.account_id, a.platform, a.app_version, a.properties,
        a.session_id, a.source, a.schema_version, a.received_at, ${eventAudience('a')} as audience,
        coalesce('install:' || mobile_install_id, 'anonymous:' || anonymous_id, 'account:' || account_id) as actor
      from analytics_events a where a.platform in ('web','ios','android')
        and a.event_name !~ '^(battle|leaderboard)_'
        and coalesce(a.properties->>'screen','') !~* '(^|/)(battle|leaderboard)(/|[?#]|$)'
        and coalesce(a.properties->>'path','') !~* '^/(battle|leaderboard)(/|[?#]|$)'
        and a.occurred_at >= ${start}::timestamp and a.occurred_at < ${end}::timestamp
    ), audience_breakdown as (
      select audience, count(*) as events, count(distinct actor) as devices,
        count(*) filter(where platform in ('ios','android') and coalesce(properties->>'runtime_environment','unknown') = 'unknown') as runtime_unconfirmed_events
      from scoped_events group by audience order by audience
    ), e as materialized (
      select event_name, occurred_at, account_id, platform, app_version, properties, session_id, source, schema_version, received_at,
        actor
      from scoped_events where audience = 'customer'
        and event_name <> 'referral_invite_redeemed'
        and platform in ('web','ios','android')
        and coalesce(properties->>'path', '') not like '/admin%'
        and occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp and ${platform}
    ), user_reports as materialized (
      select a.status, a.created_at from analyses a join photos p on p.id = a.photo_id
      where p.source = 'user' and ${customerAccount(sql`p.user_id`)} and a.id not in (select id from excluded_reports) and a.created_at >= ${start}::timestamp and a.created_at < ${end}::timestamp
    ), report_ledger_daily as (
      select ${reportingBucket(sql`created_at`, Number(filters.days))} as day,
        count(*) filter(where status = 'complete') as completed,
        count(*) filter(where status = 'failed') as failed
      from user_reports group by 1 order by 1
    ), scan_ledger as materialized (
      select r.status, r.created_at, r.result->'analysis'->>'id' as analysis_id
      from scan_reservations r join payment_entitlements p on p.id = r.entitlement_id
      where r.created_at >= ${start}::timestamp and r.created_at < ${end}::timestamp
        and p.id not in (select id from excluded_entitlements)
    ), scan_ledger_daily as (
      select ${reportingBucket(sql`created_at`, Number(filters.days))} as day, count(*) as started,
        count(*) filter(where status = 'complete') as completed,
        count(*) filter(where status = 'failed') as failed,
        count(*) filter(where status = 'pending') as pending
      from scan_ledger group by 1 order by 1
    ), reported_events as materialized (
      select * from e union all
      select event_name, occurred_at, account_id, platform, app_version, properties, session_id, source, schema_version, received_at, null::text as actor
      from analytics_events server_event where ${customerEvent('server_event')} and platform = 'server' and source is distinct from 'backend'
        and event_name <> 'referral_invite_redeemed'
        and occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp
      union all
      -- Qualification is committed with the reward transaction. The ledger is
      -- authoritative, including older signups that never emitted a client event.
      select 'referral_invite_redeemed', created_at at time zone 'UTC', referred_user_id,
        'server', null::text, '{}'::jsonb, null::text, 'referral_ledger', 1,
        created_at at time zone 'UTC', null::text
      from referral_signups where ${customerAccount(sql`referred_user_id`)} and ${customerAccount(sql`inviter_user_id`)} and created_at >= ${start}::timestamptz and created_at < ${end}::timestamptz
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
      from reported_events where ${eventReportFilter} group by event_name order by events desc
    ), event_platforms as (
      select event_name as event, platform, coalesce(source,'unknown') as source, count(*) as events,
        count(distinct actor) as actors, count(distinct account_id) as accounts
      from reported_events where ${eventReportFilter} group by 1,2,3 order by events desc limit 300
    ), event_delivery as (
      select platform,coalesce(app_version,'unknown') as release,schema_version,count(*) as events,
        count(*) filter(where received_at < occurred_at) as clock_skew_events,
        round((percentile_cont(0.5) within group(order by extract(epoch from (received_at-occurred_at))*1000)
          filter(where received_at >= occurred_at))::numeric) as median_ms,
        round((percentile_cont(0.9) within group(order by extract(epoch from (received_at-occurred_at))*1000)
          filter(where received_at >= occurred_at))::numeric) as p90_ms
      from reported_events group by 1,2,3 order by events desc limit 100
    ), dimension_actor_counts as (
      -- Hash repeated observations per actor before counting distinct devices.
      select ${dimensionSection} as section, e.event_name as event, p.key as dimension, p.value, e.actor, count(*) as events
      from reported_events e join event_definitions d on d.event = e.event_name
        cross join lateral jsonb_each_text(e.properties) p
      where ${filters.section ? sql`${dimensionSection} = ${filters.section}` : sql`true`}
        and p.key in (${sql.join(trackingDimensions.map(key => sql`${key}`), sql`,`)}) and p.value is not null
        and jsonb_typeof(e.properties->p.key) in ('string','number','boolean')
      group by 1,2,3,4,5
    ), dimension_counts as (
      select section,event,dimension,value,sum(events)::bigint as events,count(actor) as actors
      from dimension_actor_counts group by 1,2,3,4
    ), dimensions as (
      select section, event, dimension, value, events, actors from (
        select *, row_number() over (partition by section, dimension order by events desc, event, value) as rank
        from dimension_counts
      ) ranked where rank <= 20 order by section, dimension, events desc, event, value
    ), context_observations as materialized (
      -- Reduce to scalar values before grouping; sorting full event properties
      -- once per coverage field spills hundreds of megabytes on real windows.
      select f.field, e.properties->>f.field as value, e.actor
      from e cross join (values ${contextDefinitions}) f(field)
      where e.properties->>f.field is not null
    ), context_counts as (
      select field, count(*) filter(where value <> '') as events,
        count(distinct actor) filter(where value <> '') as actors,
        count(distinct value) as unique_ids
      from context_observations group by field
    ), context_coverage as (
      select f.field, coalesce(c.events,0) as events, coalesce(c.actors,0) as actors, coalesce(c.unique_ids,0) as unique_ids
      from (values ${contextDefinitions}) f(field)
      left join context_counts c using(field) order by f.field
    ), billing_history as materialized (
      select * from subscription_events where environment = 'production' and ${customerAccount(sql`coalesce(account_id,external_user_id)`)}
        and occurred_at < ${end}::timestamp
    ), b as materialized (
      select * from billing_history where occurred_at >= ${start}::timestamp
    ), ${['CreatorAttribution', 'CreatorEconomics', 'AttributionLedger'].includes(filters.section ?? '') ? creatorAttributionCTEs(filters.section === 'CreatorEconomics' ? '1970-01-01T00:00:00Z' : start, end, Number(filters.days)) : sql`creator_attribution as (select null::json as report)`}, ${filters.section === 'CreatorEconomics' ? creatorEconomicsCTEs(start, end, Number(filters.days)) : sql`creator_economics as (select null::json as report)`}, ${filters.section === 'Authentication' ? authenticationCTEs(start, end, filters.platform) : sql`authentication as (select null::json as report)`}, ${filters.section === 'Purchases' ? purchaseFlowCTEs(start, end, Number(filters.days)) : sql`purchase_flow as (select null::json as report)`}, ${filters.section === 'Scans' ? scansCTEs(start, end, Number(filters.days)) : sql`scans as (select null::json as report)`}, ${filters.section === 'Engagement' ? engagementCTEs(Number(filters.days)) : sql`engagement as (select null::json as report)`}, ${filters.section === 'Referrals' ? referralsCTEs(start, end, Number(filters.days)) : sql`referrals as (select null::json as report)`}, ${filters.section === 'Notifications' ? notificationsCTEs(start,end,Number(filters.days)) : sql`notifications as (select null::json as report)`}, ${filters.section === 'AttributionLedger' ? ledgerCTEs(Number(filters.days)) : sql`attribution_ledger as (select null::json as report)`}, ${filters.section === 'Quality' ? dataHealthCTEs(start,end,Number(filters.days)) : sql`data_health as (select null::json as report)`}, ${sql.join([...onboarding.ctes, ...paywall.ctes, ...web.ctes], sql`,`)},
    daily as (
      select ${reportingBucket(sql`occurred_at`, Number(filters.days))} as day, count(distinct actor) as actors,
        count(distinct actor) filter (where platform = 'web' and event_name = 'page_viewed'
          and properties->>'path' like '/%'
          and properties->>'path' !~ '^/(creator|admin|auth|app)(/|$|[?#])') as website_visitors,
        count(distinct actor) filter (where event_name = 'app_store_redirected') as store_clickers,
        count(*) filter (where event_name = 'evaluation_completed') as evaluations,
        count(*) filter (where event_name = 'evaluation_started') as scan_starts,
        count(*) filter (where event_name = 'onboarding_started') as onboarding_starts,
        count(*) filter (where event_name = 'onboarding_completed') as onboarding_completions,
        count(*) filter (where event_name = 'account_auth_started') as auth_starts,
        count(*) filter (where event_name = 'account_authenticated') as auth_successes,
        count(*) filter (where event_name = 'account_auth_failed') as auth_failures,
        count(*) filter (where event_name = 'account_auth_cancelled') as auth_cancellations,
        count(*) filter (where event_name = 'account_post_login_failed') as post_login_failures,
        count(*) filter (where event_name = 'referral_invite_created') as referral_invites,
        count(*) filter (where event_name = 'referral_invite_redeemed') as referral_redemptions,
        count(*) filter (where event_name = 'push_opened') as push_opens,
        count(*) filter (where event_name = 'purchase_completed') as purchase_completions,
        count(distinct actor) filter (where event_name = 'app_first_open') as first_opens,
        count(*) filter (where event_name = 'app_store_redirected') as store_redirects,
        count(*) filter (where event_name = 'paywall_viewed') as paywall_views,
        count(*) filter (where event_name = 'purchase_started') as purchase_starts,
        count(*) filter (where event_name = 'evaluation_failed') as failures,
        count(*) filter (where event_name = 'report_viewed') as report_views,
        count(*) filter (where event_name = 'protocol_task_completed') as protocol_tasks,
        count(distinct actor) filter (where event_name = 'course_lesson_viewed') as course_learners,
        count(*) filter (where event_name = 'course_lesson_completed') as lessons_completed,
        count(distinct actor) filter (where event_name = 'progress_viewed') as progress_users
      from reported_events where platform in ('web','ios','android') or event_name = 'referral_invite_redeemed'
      group by 1 order by 1
    ), creator_source_labels as (
      select l.id as source, 'Creator · ' || coalesce(nullif(a.handle,''),nullif(a.display_name,''),l.slug)
        || ' · ' || a.platform::text as source_label
      from creator_tracking_links l join creator_social_accounts a on a.id = l.social_account_id
    ), landing_definitions(experiment_id, name, version) as (values ${sql.join(landingExperiments.map(({ id, name, version }) => sql`(${id}::text, ${name}::text, ${version}::text)`), sql`,`)}),
    landing_entries as materialized (
      select distinct on (properties->>'landing_id') properties->>'landing_id' as landing_id,
        properties->>'experiment_id' as experiment_id, properties->>'variant' as variant,
        coalesce(${acquisitionSource},'direct / unattributed') as source,
        occurred_at as at
      from e where platform = 'web' and event_name = 'landing_viewed' and properties->>'path' = '/'
        and nullif(properties->>'landing_id','') is not null
        and exists (select 1 from landing_definitions d where d.experiment_id = properties->>'experiment_id' and d.version = properties->>'landing_version')
        and properties->>'variant' in ('a','b')
      order by properties->>'landing_id', occurred_at
    ), landing_outcomes as materialized (
      select l.*,
        coalesce(bool_or(o.event_name = 'app_store_redirected' and o.properties->>'path' = '/' and coalesce(o.properties->>'placement','') not in ('automatic_iphone','iphone_handoff')),false) as store,
        coalesce(bool_or(o.event_name = 'app_store_redirected' and o.properties->>'placement' in ('automatic_iphone','iphone_handoff')),false) as handoff,
        coalesce(bool_or((o.event_name = 'landing_cta_clicked' and o.properties->>'path' = '/' and o.properties->>'destination' = 'web_analysis') or (o.event_name = 'page_viewed' and o.properties->>'path' = '/analysis')),false) as web_analysis,
        coalesce(bool_or(o.event_name = 'paywall_viewed' and o.properties->>'surface' = 'web_analysis'),false) as paywall,
        coalesce(bool_or(o.event_name = 'checkout_started' and o.platform = 'server'),false) as checkout,
        coalesce(bool_or(o.event_name = 'checkout_completed' and o.platform = 'server' and o.properties->>'status' = 'paid'
          and case when jsonb_typeof(o.properties->'price') = 'number' then (o.properties->>'price')::numeric > 0 else false end),false) as paid
      from landing_entries l left join reported_events o on o.properties->>'landing_id' = l.landing_id
        and o.occurred_at >= l.at and o.occurred_at <= l.at + interval '7 days'
        and o.properties->>'experiment_id' = l.experiment_id and o.properties->>'variant' = l.variant
        and o.event_name in ('app_store_redirected','landing_cta_clicked','page_viewed','paywall_viewed','checkout_started','checkout_completed','landing_section_viewed')
      group by l.landing_id,l.experiment_id,l.variant,l.source,l.at
    ), landing_experiments as (
      select d.experiment_id,d.name,v.variant,count(l.landing_id) as visitors,
        count(l.landing_id) filter(where not l.handoff) as homepage_visitors,
        count(*) filter(where l.store and not l.handoff) as store_clicks, count(*) filter(where l.web_analysis) as web_starts,
        count(*) filter(where l.paywall) as paywalls, count(*) filter(where l.checkout) as checkouts,
        count(*) filter(where l.paid) as paid_checkouts,
        count(*) filter(where l.at <= ${end}::timestamp - interval '7 days' and (not l.handoff)) as mature,
        count(*) filter(where l.store and not l.handoff and l.at <= ${end}::timestamp - interval '7 days') as mature_store_clicks,
        count(*) filter(where l.paid and not l.handoff and l.at <= ${end}::timestamp - interval '7 days') as mature_paid_checkouts,
        count(*) filter(where l.at > ${end}::timestamp - interval '7 days' and (not l.handoff)) as pending,
        min(l.at) as first_exposure, max(l.at) as latest_exposure
      from landing_definitions d cross join (values ('a'),('b')) v(variant)
        left join landing_outcomes l on l.experiment_id = d.experiment_id and l.variant = v.variant
      group by d.experiment_id,d.name,v.variant order by d.experiment_id,v.variant
    ), landing_experiment_daily as (
      select experiment_id, ${reportingBucket(sql`at`, Number(filters.days))} as day,
        count(*) filter(where variant = 'a') as control,
        count(*) filter(where variant = 'b') as treatment
      from landing_entries group by 1,2 order by 1,2
    ), landing_handoffs as (
      select properties->>'placement' as placement, properties->>'destination' as destination,
        count(distinct properties->>'landing_id') as browsers
      from e where platform = 'web' and event_name = 'destination_selected'
        and properties->>'placement' in ('automatic_iphone','iphone_handoff')
      group by 1,2
    ), web_audience as (
      select case when properties->>'path' like '/creator%' then 'Creator portal'
        when properties->>'path' like '/app/%' or properties->>'path' like '/auth%' then 'Authentication / app handoff'
        else 'Public website' end as surface,
        count(*) as pageviews,count(distinct actor) as browsers
      from scoped_events where audience in ('customer','creator / admin') and platform = 'web' and event_name = 'page_viewed' group by 1
    ), landing_summary as (
      select count(*) as entries, count(*) filter(where store) as store_clicks,
        count(*) filter(where web_analysis) as web_starts, count(*) filter(where paid) as paid_entries
      from landing_outcomes
    ), landing_sources as (
      select l.source,coalesce(max(labels.source_label),l.source) as source_label,
        count(*) as visitors,count(*) filter(where store) as store_clicks,
        count(*) filter(where web_analysis) as web_starts,count(*) filter(where paid) as paid_checkouts
      from landing_outcomes l left join creator_source_labels labels on labels.source = l.source
      group by l.source order by visitors desc limit 30
    ), landing_engagement as materialized (
      select properties->>'landing_id' as landing_id, properties->>'placement' as placement,
        properties->>'destination' as destination, occurred_at, event_name from e
      where event_name in ('landing_section_viewed','landing_cta_clicked') and properties->>'path' = '/'
    ), landing_sections as (
      select o.placement as section,count(distinct l.landing_id) as visitors
      from landing_entries l join landing_engagement o on o.landing_id = l.landing_id
        and o.occurred_at >= l.at and o.occurred_at <= l.at + interval '7 days'
      where o.event_name = 'landing_section_viewed'
      group by 1 order by visitors desc
    ), landing_placements as (
      select o.placement as placement,o.destination as destination,
        count(distinct l.landing_id) as visitors
      from landing_entries l join landing_engagement o on o.landing_id = l.landing_id
        and o.occurred_at >= l.at and o.occurred_at <= l.at + interval '7 days'
      where o.event_name = 'landing_cta_clicked'
      group by 1,2 order by visitors desc
    ), acquisition_actors as (
      select distinct on (actor) actor, coalesce(${acquisitionSource},'direct / unattributed') as source,
        coalesce(nullif(properties->>'first_utm_campaign',''),nullif(properties->>'utm_campaign',''),'—') as campaign
      from e where actor is not null
      order by actor, (${acquisitionSource} is null),
        (nullif(properties->>'creator_first_tracking_link_id','') is null),
        (nullif(properties->>'first_utm_source','') is null), occurred_at
    ), acquisition_activity as materialized (
      -- One row per device prevents sorting the full event stream repeatedly for
      -- each distinct-count aggregate and source/campaign breakdown.
      select actor,
        bool_or(platform = 'web' and event_name = 'page_viewed' and properties->>'path' like '/%'
          and properties->>'path' !~ '^/(creator|admin|auth|app)(/|$|[?#])') as website_visitor,
        bool_or(event_name = 'app_store_redirected') as store_clicker,
        bool_or(event_name = 'app_first_open') as first_open,
        bool_or(event_name = 'purchase_completed') as purchaser
      from e where actor is not null group by actor
    ), acquisition_summary as (
      select count(*) as devices,
        count(*) filter(where e.website_visitor) as website_visitors,
        count(*) filter(where e.store_clicker) as store_clickers,
        count(*) filter(where e.first_open) as first_opens,
        count(*) filter(where a.source <> 'direct / unattributed') as sourced_devices
      from acquisition_activity e join acquisition_actors a on a.actor = e.actor
    ), acquisition as (
      select a.source, coalesce(max(labels.source_label),a.source) as source_label, a.campaign, count(*) as actors,
        count(*) filter (where e.first_open) as first_opens,
        count(*) filter (where e.store_clicker) as store_redirects,
        count(*) filter (where e.purchaser) as purchase_actors
      from acquisition_activity e join acquisition_actors a on a.actor=e.actor
        left join creator_source_labels labels on labels.source = a.source
      group by a.source,a.campaign order by actors desc limit 50
    ), onboarding_flow_events as materialized (
      select actor, properties->>'flow_id' as flow_id, event_name, occurred_at
      from e where platform in ('ios','android') and ${supportedOnboarding}
        and actor is not null and nullif(properties->>'flow_id','') is not null
        and event_name in ('onboarding_started','onboarding_completed')
    ), onboarding_entries as (
      select actor, flow_id, min(occurred_at) as at from onboarding_flow_events
      where event_name = 'onboarding_started' group by actor, flow_id
    ), onboarding_flow_outcomes as materialized (
      select f.actor, f.flow_id, f.at, coalesce(bool_or(o.event_name = 'onboarding_completed'),false) as completed
      from onboarding_entries f left join onboarding_flow_events o
        on o.actor = f.actor and o.flow_id = f.flow_id and o.event_name = 'onboarding_completed'
        and o.occurred_at >= f.at and o.occurred_at <= f.at + interval '7 days'
      group by f.actor, f.flow_id, f.at
    ), onboarding_summary as (
      select count(*) as started, count(*) filter(where completed) as completed,
        count(*) filter(where at <= ${end}::timestamp - interval '7 days') as eligible,
        count(*) filter(where completed and at <= ${end}::timestamp - interval '7 days') as eligible_completed,
        count(*) filter(where at > ${end}::timestamp - interval '7 days') as pending,
        (select count(*) from e where platform in ('ios','android') and event_name = 'onboarding_started') as start_events,
        (select count(*) from onboarding_flow_events where event_name = 'onboarding_started') as compatible_start_events,
        (select max(occurred_at) from onboarding_flow_events) as latest_event
      from onboarding_flow_outcomes
    ), onboarding_daily as (
      select ${reportingBucket(sql`at`, Number(filters.days))} as day, count(*) as started,
        count(*) filter(where completed) as completed
      from onboarding_flow_outcomes group by 1 order by 1
    ), onboarding_definitions(step, label, position) as (values ${sql.join(onboardingAnalyticsSteps.map(([step, label], index) => sql`(${step}::text, ${label}::text, ${index}::integer)`), sql`,`)}),
    onboarding_observations as materialized (
      select e.actor, e.properties->>'flow_id' as flow_id, d.step, d.position, e.occurred_at,
        case when jsonb_typeof(e.properties->'step_index') = 'number' then
          case when (e.properties->>'step_index')::numeric between 0 and 1000 then (e.properties->>'step_index')::numeric else d.position end
          else d.position end as sequence_index,
        e.event_name, case when jsonb_typeof(e.properties->'duration_ms') = 'number'
          then (e.properties->>'duration_ms')::numeric end as duration_ms
      from e join onboarding_definitions d on d.step = e.properties->>'step'
      where e.platform in ('ios','android') and e.actor is not null
        and nullif(e.properties->>'flow_id', '') is not null
        and ${supportedOnboarding}
        and e.event_name in ('onboarding_step_viewed','onboarding_step_exited','onboarding_step_back')
    ), onboarding_forward_events as materialized (
      select actor, flow_id, step, sequence_index as position, occurred_at as at from onboarding_observations
      where event_name = 'onboarding_step_viewed'
      union all
      select actor, properties->>'flow_id', ''::text, 1001::numeric, occurred_at from e
      where event_name = 'evaluation_completed' and platform in ('ios','android')
        and ${supportedOnboarding}
        and actor is not null and nullif(properties->>'flow_id', '') is not null
    ), onboarding_timelines as (
      select actor, flow_id, array_agg(step) as steps, array_agg(position) as positions, array_agg(at) as times
      from onboarding_forward_events group by actor, flow_id
    ), onboarding_progress as (
      select t.actor, t.flow_id, v.step, v.at, exists (
        select 1 from unnest(t.positions, t.times) n(position, at)
        where n.position > v.position and n.at >= v.at and n.at <= v.at + interval '7 days'
      ) as continued
      from onboarding_timelines t cross join lateral (
        select distinct on (step) step, position, at
        from unnest(t.steps, t.positions, t.times) n(step, position, at)
        where step <> '' order by step, at
      ) v
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
      where e.platform in ('ios','android') and ${supportedOnboarding}
        and (e.event_name in ('photo_validation_failed','account_auth_failed','account_post_login_failed','purchase_failed','purchase_cancelled','restore_failed','evaluation_failed')
          or (e.event_name = 'permission_result' and e.properties->>'result' = 'denied')
          or (e.event_name = 'consent_result' and e.properties->>'result' = 'declined'))
      group by d.position, d.label, e.event_name, 3 order by d.position, affected_devices desc limit 50
    ), steps as (
      select properties->>'step' as step,
        count(distinct actor) filter (where event_name = 'onboarding_step_viewed') as viewed,
        count(distinct actor) filter (where event_name = 'onboarding_step_completed') as completed,
        count(distinct actor) filter (where event_name = 'onboarding_step_skipped') as skipped,
        count(*) filter (where event_name = 'onboarding_step_back') as back_actions
      from e where event_name like 'onboarding_step_%'
        and (platform = 'web' or (platform in ('ios','android')
          and ${supportedOnboarding}
          and properties->>'step' in (select step from onboarding_definitions)))
      group by 1 order by viewed desc limit 50
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
        sum(amount)::text as net, count(*) filter(where amount is null and ${monetaryBillingEvent}) as missing_amount_events
      from b group by 1,2,3 order by events desc limit 100
    ), billing_dimension_counts as (
      select provider, event_name as event, p.key as dimension, p.value, count(*) as events
      from b cross join lateral jsonb_each_text(properties) p
      where p.key in ('period_type','trial_conversion','store','country','cancel_reason','expiration_reason','new_product_id','offering','offer_code','commission_percentage','tax_percentage','timestamp_estimated','failure_code','decline_code')
        and p.value is not null and jsonb_typeof(properties->p.key) in ('string','number','boolean')
      group by 1,2,3,4
    ), billing_dimensions as (
      select provider,event,dimension,value,events from (
        select *,row_number() over(partition by dimension order by events desc,provider,event,value) as rank from billing_dimension_counts
      ) ranked where rank <= 20 order by dimension,events desc
    ), revenue as (
      select coalesce(currency, 'UNKNOWN') as currency,
        count(distinct coalesce('account:' || account_id, provider || ':external:' || external_user_id)) filter(where amount > 0) as paying_customers,
        count(*) filter(where amount > 0 and account_id is null and external_user_id is null) as unidentified_payments,
        case when count(amount) > 0 then coalesce(sum(amount) filter (where amount > 0), 0)::text end as gross,
        case when count(amount) > 0 then coalesce(-sum(amount) filter (where amount < 0), 0)::text end as refunds,
        sum(amount)::text as net,
        count(*) filter (where amount is null and ${monetaryBillingEvent}) as missing_amount_events
      from b group by 1 order by 1
    ), billing_customer_first_paid as (
      select coalesce('account:' || account_id, provider || ':external:' || external_user_id) as customer,
        min(occurred_at) as first_paid_at
      from billing_history where amount>0
      group by 1
    ), revenue_comparison as (
      select coalesce(h.currency,'UNKNOWN') as currency,
        coalesce(sum(h.amount) filter(where h.occurred_at >= ${start}::timestamp),0)::text as current_net,
        coalesce(sum(h.amount) filter(where h.occurred_at < ${start}::timestamp),0)::text as previous_net,
        coalesce(sum(h.amount) filter(where h.amount>0 and h.occurred_at >= ${start}::timestamp),0)::text as current_gross,
        coalesce(sum(h.amount) filter(where h.amount>0 and h.occurred_at < ${start}::timestamp),0)::text as previous_gross,
        coalesce(-sum(h.amount) filter(where h.amount<0 and h.occurred_at >= ${start}::timestamp),0)::text as current_refunds,
        coalesce(-sum(h.amount) filter(where h.amount<0 and h.occurred_at < ${start}::timestamp),0)::text as previous_refunds,
        count(distinct first.customer) filter(where h.amount>0 and h.occurred_at >= ${start}::timestamp) as current_paying_customers,
        count(distinct first.customer) filter(where h.amount>0 and h.occurred_at < ${start}::timestamp) as previous_paying_customers,
        count(distinct first.customer) filter(where h.amount>0 and h.occurred_at >= ${start}::timestamp and first.first_paid_at >= ${start}::timestamp) as current_new_customers,
        count(distinct first.customer) filter(where h.amount>0 and h.occurred_at < ${start}::timestamp and first.first_paid_at >= ${start}::timestamp - ${Number(filters.days)}::integer * interval '1 day') as previous_new_customers,
        count(*) filter(where h.amount is null and ${monetaryBillingEvent}) as missing_amount_events
      from billing_history h left join billing_customer_first_paid first
        on first.customer=coalesce('account:' || h.account_id,h.provider || ':external:' || h.external_user_id)
      where h.occurred_at >= ${start}::timestamp - ${Number(filters.days)}::integer * interval '1 day'
      group by 1
    ), billing_reporting as (
      select max(occurred_at) as latest_event, max(received_at) as latest_receipt,
        count(*) filter(where occurred_at >= ${start}::timestamp and amount is null and ${monetaryBillingEvent}) as missing_amount_events,
        count(*) filter(where amount is null and ${monetaryBillingEvent}) as all_time_missing_amount_events,
        (select count(*) from payment_entitlements p where p.stripe_checkout_session_id like 'cs_live_%'
          and p.id not in (select id from excluded_entitlements)
          and not exists(select 1 from subscription_events s where s.provider = 'stripe'
            and s.provider_event_id = 'checkout:' || p.stripe_checkout_session_id)) as unrecorded_stripe_purchases,
        (select occurred_at from analytics_events where event_name = 'backend_billing_reconciliation'
          and environment = 'production' and source = 'backend' and occurred_at < ${end}::timestamp order by occurred_at desc limit 1) as recovery_checked_at,
        (select properties->>'webhook_ready' from analytics_events where event_name = 'backend_billing_reconciliation'
          and environment = 'production' and source = 'backend' and occurred_at < ${end}::timestamp order by occurred_at desc limit 1) as webhook_ready
      from billing_history
    ), revenue_totals as (
      select coalesce(currency, 'UNKNOWN') as currency, sum(amount)::text as net,
        coalesce(sum(amount) filter(where occurred_at >= ${end}::timestamp - interval '24 hours'),0)::text as last_24h,
        coalesce(sum(amount) filter(where occurred_at >= ${end}::timestamp - interval '48 hours'
          and occurred_at < ${end}::timestamp - interval '24 hours'),0)::text as previous_24h,
        count(*) filter(where amount is null and ${monetaryBillingEvent}) as missing_amount_events,
        count(*) filter(where amount is null and ${monetaryBillingEvent}
          and occurred_at >= ${end}::timestamp - interval '48 hours') as recent_missing_amount_events
      from billing_history group by 1 having count(amount) > 0 or count(*) filter(where ${monetaryBillingEvent}) > 0
      order by 1
    ), subscription_identities as (
      select distinct provider,subscription_id from billing_history where subscription_id is not null
        and event_name in (${sql.join(subscriptionLifecycleEvents.filter(name => !['subscription_refunded','refund_reversed'].includes(name)).map(name => sql`${name}`), sql`,`)})
    ), subscription_facts as (
      select *,
        case when jsonb_typeof(properties->'expiration_at_ms') = 'number' then
          case when (properties->>'expiration_at_ms')::numeric between 0 and 8640000000000000
            then to_timestamp((properties->>'expiration_at_ms')::double precision / 1000) at time zone 'UTC' end end as expires_at,
        case when jsonb_typeof(properties->'grace_period_expiration_at_ms') = 'number' then
          case when (properties->>'grace_period_expiration_at_ms')::numeric between 0 and 8640000000000000
            then to_timestamp((properties->>'grace_period_expiration_at_ms')::double precision / 1000) at time zone 'UTC' end end as grace_ends_at,
        case when properties->>'cancel_at_period_end' in ('true','false') then (properties->>'cancel_at_period_end')::boolean
          when event_name in ('cancellation_scheduled','subscription_pause_scheduled','subscription_expired','subscription_refunded') then true
          when event_name in ('subscription_started','subscription_reactivated','subscription_renewed','trial_started','trial_converted','invoice_paid','refund_reversed') then false end as canceled,
        case when event_name in ('subscription_expired','subscription_refunded') or properties->>'status' in ('canceled','unpaid','paused','incomplete_expired') then true
          when event_name in ('subscription_started','subscription_reactivated','subscription_renewed','trial_started','trial_converted','invoice_paid','refund_reversed') then false end as ended
      from billing_history h where exists(select 1 from subscription_identities i where i.provider=h.provider and i.subscription_id=h.subscription_id)
        and event_name in (${sql.join(subscriptionLifecycleEvents.map(name => sql`${name}`), sql`,`)})
    ), first_subscriptions as (
      select provider, subscription_id, min(occurred_at) as at from subscription_facts
      where amount > 0 and event_name in ('subscription_started','trial_converted','invoice_paid') group by 1,2
    ), scan_credit_purchases as (
      select distinct on (provider, coalesce(transaction_id, provider_event_id)) occurred_at,
        case ${sql.join(scanProducts.map(product => sql`when product_id in (${product.product}, ${product.productId}) then ${product.credits}::integer`), sql` `)} else 0 end as credits
      from billing_history where event_name = 'one_time_purchase'
      order by provider, coalesce(transaction_id, provider_event_id), occurred_at, received_at, id
    ), subscription_snapshots as (
      select snapshot, at, provider, subscription_id,
        (array_agg(greatest(expires_at,grace_ends_at) order by occurred_at desc,received_at desc,id desc)
          filter(where expires_at is not null or grace_ends_at is not null))[1] as ends_at,
        coalesce((array_agg(canceled order by occurred_at desc,received_at desc,id desc) filter(where canceled is not null))[1],false) as canceled,
        coalesce((array_agg(ended order by occurred_at desc,received_at desc,id desc) filter(where ended is not null))[1],false) as ended
      from (values (0,${end}::timestamp),(1,${end}::timestamp - interval '24 hours'),(2,${start}::timestamp)) snapshots(snapshot,at)
      join subscription_facts on occurred_at < at group by 1,2,3,4
    ), revenue_activity as (
      select 'new_subscriptions' as metric, count(*) as total,
        count(*) filter(where at >= ${end}::timestamp - interval '24 hours') as last_24h,
        count(*) filter(where at >= ${end}::timestamp - interval '48 hours' and at < ${end}::timestamp - interval '24 hours') as previous_24h,
        0::bigint as unknown_status, 0::bigint as previous_unknown_status,
        count(*) filter(where at >= ${start}::timestamp) as period_total from first_subscriptions
      union all
      select 'scans_bought',coalesce(sum(credits),0),
        coalesce(sum(credits) filter(where occurred_at >= ${end}::timestamp - interval '24 hours'),0),
        coalesce(sum(credits) filter(where occurred_at >= ${end}::timestamp - interval '48 hours' and occurred_at < ${end}::timestamp - interval '24 hours'),0),0,0,
        coalesce(sum(credits) filter(where occurred_at >= ${start}::timestamp),0) from scan_credit_purchases
      union all
      select 'active_subscriptions',count(*) filter(where snapshot=0 and not ended and ends_at > at),
        count(*) filter(where snapshot=0 and not ended and ends_at > at),count(*) filter(where snapshot=1 and not ended and ends_at > at),
        count(*) filter(where snapshot=0 and not ended and ends_at is null),count(*) filter(where snapshot=1 and not ended and ends_at is null),null::bigint from subscription_snapshots
      union all
      select 'canceled_subscriptions',count(*) filter(where snapshot=0 and (canceled or ended or ends_at <= at)),
        count(*) filter(where snapshot=0 and (canceled or ended or ends_at <= at)),count(*) filter(where snapshot=1 and (canceled or ended or ends_at <= at)),0,0,null::bigint from subscription_snapshots
      union all
      select 'scheduled_cancellations',count(*) filter(where snapshot=0 and canceled and not ended and ends_at > at),
        count(*) filter(where snapshot=0 and canceled and not ended and ends_at > at),count(*) filter(where snapshot=1 and canceled and not ended and ends_at > at),
        count(*) filter(where snapshot=0 and canceled and not ended and ends_at is null),
        count(*) filter(where snapshot=1 and canceled and not ended and ends_at is null),null::bigint from subscription_snapshots
    ), revenue_daily as (
      select ${reportingBucket(sql`occurred_at`, Number(filters.days))} as day, coalesce(currency, 'UNKNOWN') as currency,
        case when count(amount) > 0 then coalesce(sum(amount) filter (where amount > 0), 0)::text end as gross,
        case when count(amount) > 0 then coalesce(-sum(amount) filter (where amount < 0), 0)::text end as refunds,
        sum(amount)::text as net,
        count(*) filter (where amount is null and ${monetaryBillingEvent}) as missing_amount_events
      from b group by 1,2 order by 1,2
    ), ${revenueReportCTEs(Number(filters.days), start, end)}, paid_history as materialized (
      select account_id, min(occurred_at) as first_paid,
        min(occurred_at) filter(where event_name <> 'one_time_purchase') as first_membership
      from subscription_events paid
      where environment = 'production' and account_id is not null and ${customerAccount(sql`account_id`)}
        and amount > 0 and occurred_at < ${end}::timestamp
        and event_name in ('one_time_purchase','subscription_started','trial_converted','invoice_paid','subscription_renewed')
      group by account_id
    ), paid_cohorts as (
      select account_id, first_paid as at, 'delivery' as kind from paid_history where first_paid >= ${start}::timestamp
      union all
      select account_id, first_membership, 'membership' from paid_history where first_membership >= ${start}::timestamp
    ), paid_scans as materialized (
      select r.user_id, r.created_at, r.status, r.result->'analysis'->>'id' as report_id
      from scan_reservations r where r.entitlement_id not in (select id from excluded_entitlements)
        and r.user_id in (select account_id from paid_cohorts)
        and r.created_at >= ${start}::timestamp and r.created_at < ${end}::timestamp
    ), paid_observations as materialized (
      select * from scoped_events where audience = 'customer' and account_id in (select account_id from paid_cohorts)
        and event_name in ('purchase_activated','evaluation_completed','report_viewed','protocol_task_completed')
    ), paid_outcomes as materialized (
      select c.*, scan.created_at as scan_at, scan.report_id,
        (select min(a.occurred_at) from paid_observations a where a.account_id = c.account_id
          and a.event_name = 'purchase_activated' and a.occurred_at >= c.at) as activated_at,
        (select min(a.occurred_at) from paid_observations a where a.account_id = c.account_id
          and a.event_name = 'evaluation_completed' and exists(select 1 from paid_scans s where s.user_id = c.account_id
            and s.status = 'complete' and s.report_id = a.properties->>'report_id' and s.created_at >= c.at and s.created_at <= a.occurred_at)) as received_at,
        (select min(a.occurred_at) from paid_observations a where a.account_id = c.account_id
          and a.event_name = 'report_viewed' and exists(select 1 from paid_scans s where s.user_id = c.account_id
            and s.status = 'complete' and s.report_id = a.properties->>'report_id' and s.created_at >= c.at and s.created_at <= a.occurred_at)) as viewed_at,
        (select min(a.occurred_at) from paid_observations a where a.account_id = c.account_id
          and a.event_name = 'protocol_task_completed' and a.occurred_at >= c.at) as protocol_at,
        (select min(s.created_at) from paid_scans s where s.user_id = c.account_id and s.status = 'complete'
          and s.report_id <> scan.report_id and s.created_at >= scan.created_at + interval '1 day') as second_scan_at
      from paid_cohorts c left join lateral (
        select s.created_at,s.report_id from paid_scans s where s.user_id = c.account_id
          and s.status = 'complete' and s.report_id is not null and s.created_at >= c.at
        order by s.created_at,s.report_id limit 1
      ) scan on true
    ), paid_delivery as (
      select n.days as window_days, count(*) as payers,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day') as eligible,
        count(*) filter(where at > ${end}::timestamp - n.days * interval '1 day') as pending,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day' and activated_at < at + n.days * interval '1 day') as activation_observed,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day' and scan_at < at + n.days * interval '1 day') as report_generated,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day' and received_at < at + n.days * interval '1 day') as report_received,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day' and viewed_at < at + n.days * interval '1 day') as report_viewed,
        round((percentile_cont(0.5) within group(order by extract(epoch from viewed_at - at) * 1000)
          filter(where at <= ${end}::timestamp - n.days * interval '1 day' and viewed_at < at + n.days * interval '1 day'))::numeric) as median_ms
      from paid_outcomes cross join (values (1),(7)) n(days) where kind = 'delivery' group by n.days order by n.days
    ), membership_activation as (
      select n.days as window_days, count(*) as subscribers,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day') as eligible,
        count(*) filter(where at > ${end}::timestamp - n.days * interval '1 day') as pending,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day' and protocol_at < at + n.days * interval '1 day') as first_protocol_action,
        count(*) filter(where at <= ${end}::timestamp - n.days * interval '1 day' and second_scan_at < at + n.days * interval '1 day') as returned_for_second_scan
      from paid_outcomes cross join (values (7),(14)) n(days) where kind = 'membership' group by n.days order by n.days
    ), activation_history as materialized (
      select account_id, min(occurred_at) as at from analytics_events history
      where ${customerEvent('history')} and event_name = 'evaluation_completed'
        and platform in ('web','ios','android') and ${platform}
        and occurred_at < ${end}::timestamp and account_id is not null group by 1
    ), activated as (
      select * from activation_history where at >= ${start}::timestamp
    ), retention_outcomes as materialized (
      select a.account_id, a.at, n.day,
        a.at <= ${end}::timestamp - (n.day + 1) * interval '1 day' as eligible,
        exists (
          select 1 from e where e.account_id = a.account_id
            and (e.event_name in ('report_viewed','protocol_task_completed','evaluation_completed','course_lesson_completed','progress_area_viewed')
              or (e.event_name in ('course_lesson_exited','progress_exited')
                and case when jsonb_typeof(e.properties->'duration_ms') = 'number' then (e.properties->>'duration_ms')::numeric else 0 end between 10000 and 1800000))
            and e.occurred_at >= a.at + n.day * interval '1 day'
            and e.occurred_at < a.at + (n.day + 1) * interval '1 day'
        ) as returned from activated a cross join (values (1),(7),(30)) n(day)
    ), retention as (
      select n.day, count(o.account_id) as cohort_accounts,
        count(o.account_id) filter(where o.eligible) as eligible,
        count(o.account_id) filter(where not o.eligible) as pending,
        count(o.account_id) filter(where o.eligible and o.returned) as retained
      from (values (1),(7),(30)) n(day) left join retention_outcomes o on o.day = n.day group by 1 order by 1
    ), retention_weekly as (
      select date_trunc('week', at at time zone 'UTC', ${ADMIN_REPORTING_TIME_ZONE}) as day,
        count(*) as cohort_accounts, count(*) filter(where eligible) as eligible,
        count(*) filter(where not eligible) as pending,
        count(*) filter(where eligible and returned) as retained
      from retention_outcomes where day = 7 group by 1 order by 1
    ), retention_coverage as (
      select (select min(at) from activation_history) as earliest_scan_cohort,
        (select max(at) from activation_history) as latest_scan_cohort,
        (select max(occurred_at) from e where account_id is not null) as latest_linked_activity,
        (select max(received_at) from e where account_id is not null) as latest_linked_receipt,
        (select count(*) from e where account_id is null) as anonymous_events,
        (select count(*) from e where account_id is not null) as linked_events
    ), feature_usage as (
      select case when event_name like 'course_%' then 'courses' else 'progress' end as feature,
        case when event_name like 'course_%' then coalesce(properties->>'course_id','unknown') else 'progress' end as course_id,
        count(distinct actor) as users,
        count(distinct (actor, date_trunc('day', occurred_at at time zone 'UTC', ${ADMIN_REPORTING_TIME_ZONE}))) as active_days,
        count(distinct (actor, properties->>'lesson_id')) filter(where event_name = 'course_lesson_viewed') as lessons_opened,
        count(distinct (actor, properties->>'lesson_id')) filter(where event_name = 'course_lesson_completed') as lessons_completed,
        count(distinct actor) filter(where event_name = 'course_completed') as courses_completed,
        count(*) filter(where event_name = 'progress_area_viewed') as area_views,
        count(distinct actor) filter(where event_name = 'progress_action_selected' and properties->>'action' = 'protocol') as protocol_opens,
        count(distinct actor) filter(where event_name = 'progress_action_selected' and properties->>'action' = 'evaluations') as evaluation_opens,
        round((percentile_cont(0.5) within group(order by
          case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric end)
          filter(where event_name in ('course_lesson_exited','progress_exited')
            and case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric else -1 end between 0 and 1800000))::numeric) as median_ms
      from e where actor is not null and event_name in ('course_viewed','course_lesson_viewed','course_lesson_exited','course_lesson_completed','course_completed',
        'progress_viewed','progress_exited','progress_area_viewed','progress_action_selected')
      group by 1,2 order by 1,2
    ), feature_history as materialized (
      select account_id, occurred_at,
        case when event_name like 'course_%' then 'courses' else 'progress' end as feature
      from analytics_events history
      where ${customerEvent('history')} and ${platform} and platform in ('ios','android','web')
        and account_id is not null and occurred_at < ${end}::timestamp
        and (event_name in ('course_lesson_completed','progress_area_viewed')
          or (event_name in ('course_lesson_exited','progress_exited')
            and case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric else 0 end between 10000 and 1800000))
    ), feature_first_usage as (
      select account_id, feature, min(occurred_at) as at from feature_history group by 1,2
    ), feature_retention as (
      select f.feature, n.day,
        count(a.account_id) as cohort_accounts,
        count(a.account_id) filter(where a.at <= ${end}::timestamp - (n.day + 1) * interval '1 day') as eligible,
        count(a.account_id) filter(where a.at <= ${end}::timestamp - (n.day + 1) * interval '1 day' and exists(
          select 1 from feature_history h where h.account_id = a.account_id and h.feature = f.feature
            and h.occurred_at >= a.at + n.day * interval '1 day' and h.occurred_at < a.at + (n.day + 1) * interval '1 day'
        )) as retained
      from (values ('courses'),('progress')) f(feature) cross join (values (1),(7),(30)) n(day)
      left join feature_first_usage a on a.feature = f.feature and a.at >= ${start}::timestamp
      group by 1,2 order by 1,2
    ), cancellation_accounts as (
      select account_id, min(occurred_at) as at from b
      where event_name = 'cancellation_scheduled' and account_id is not null group by 1
    ), cancellations as (
      select case when a.at is null then 'No evaluation recorded'
        when c.at < a.at then 'Before evaluation'
        when c.at < a.at + interval '1 day' then 'Within 24 hours'
        when c.at < a.at + interval '7 days' then 'Within 7 days'
        else 'Later' end as timing, count(*) as accounts
      from cancellation_accounts c left join activation_history a using(account_id) group by 1
    ), actions as (
      select event_name as event, count(*) as events, count(distinct actor) as actors from e
      where event_name in ('report_viewed','category_viewed','protocol_viewed','protocol_task_completed',
        'repeat_evaluation_started','share_started','referral_invite_created','push_opened','evaluation_failed','purchase_failed','restore_failed',
        'course_lesson_viewed','course_lesson_completed','course_completed','progress_viewed','progress_area_viewed','progress_action_selected')
      group by 1 order by events desc
    ), releases as (
      select coalesce(app_version, 'unknown') as release, platform,
        count(distinct actor) as actors,
        count(*) filter (where event_name = 'evaluation_started') as evaluations_started,
        count(*) filter (where event_name = 'evaluation_failed') as evaluation_failures,
        round((percentile_cont(0.5) within group (order by case when jsonb_typeof(properties->'duration_ms') = 'number' then (properties->>'duration_ms')::numeric end)
          filter (where event_name = 'evaluation_completed' and jsonb_typeof(properties->'duration_ms') = 'number'))::numeric) as median_evaluation_ms
      from e group by 1,2 order by actors desc limit 30
    ), onboarding_revisions as (
      select coalesce(properties->>'onboarding_version','unversioned') as revision,
        count(*) as views, count(distinct actor) as devices,
        case when properties->>'onboarding_version' in (${sql.join(supportedOnboardingVersions.map(version => sql`${version}`), sql`,`)}) then 'Included in screen cohorts' else 'Event totals only' end as coverage
      from e where platform in ('ios','android') and event_name = 'onboarding_step_viewed'
      group by 1,4 order by 1
    ) select json_build_object(
      'notifications', ${include('notifications', sql`(select report from notifications)`, sql`null::json`)},
      'attributionLedger', ${include('attribution_ledger', sql`(select report from attribution_ledger)`, sql`null::json`)},
      'dataHealth', ${include('data_health', sql`(select report from data_health)`, sql`null::json`)},
      'referrals', ${include('referrals', sql`(select report from referrals)`, sql`null::json`)},
      'engagement', ${include('engagement', sql`(select report from engagement)`, sql`null::json`)},
      'scans', ${include('scans', sql`(select report from scans)`, sql`null::json`)},
      'purchaseFlow', ${include('purchase_flow', sql`(select report from purchase_flow)`, sql`null::json`)},
      'authentication', ${include('authentication', sql`(select report from authentication)`, sql`null::json`)},
      'creatorEconomics', ${include('creator_economics', sql`(select report from creator_economics)`, sql`null::json`)},
      'creatorAttribution', ${include('creator_attribution', sql`(select report from creator_attribution)`, sql`null::json`)},
      'paidDelivery', ${rows('paid_delivery')}, 'membershipActivation', ${rows('membership_activation')},
      'reportLedger', ${include('reportLedger', sql`json_build_object('summary', (select json_build_object(
        'completed', count(*) filter(where status = 'complete'), 'failed', count(*) filter(where status = 'failed'),
        'other', count(*) filter(where status not in ('complete','failed'))) from user_reports), 'daily', coalesce((select json_agg(r) from report_ledger_daily r), '[]'::json))`)},
      'onboardingRevisions', ${rows('onboarding_revisions')},
      'scanLedger', ${include('scanLedger', sql`json_build_object('summary', (select json_build_object(
        'started', count(*), 'completed', count(*) filter(where status = 'complete'),
        'failed', count(*) filter(where status = 'failed'), 'pending', count(*) filter(where status = 'pending'),
        'reports', count(distinct analysis_id) filter(where status = 'complete')) from scan_ledger),
        'daily', coalesce((select json_agg(r) from scan_ledger_daily r), '[]'::json))`)}
    )::jsonb || jsonb_build_object(
      'summary', (select json_build_object('events', count(*), 'actors', count(distinct actor),
        'first_opens', count(distinct actor) filter (where event_name = 'app_first_open'),
        'evaluations', count(*) filter (where event_name = 'evaluation_completed'),
        'failures', count(*) filter (where event_name = 'evaluation_failed'), 'latest_event', max(occurred_at)) from e),
      'audienceBreakdown', ${rows('audience_breakdown')}, 'onboarding', ${include('onboarding', onboarding.result)}, 'paywall', ${include('paywall', paywall.result)}, 'web', ${include('web', web.result)},
      'landingHandoffs', ${rows('landing_handoffs')}, 'webAudience', ${rows('web_audience')}, 'landingExperiments', ${rows('landing_experiments')},
      'landingExperimentDaily', ${rows('landing_experiment_daily')}, 'landingSources', ${rows('landing_sources')},
      'landingSections', ${rows('landing_sections')}, 'landingPlacements', ${rows('landing_placements')},
      'daily', ${rows('daily')}, 'acquisition', ${rows('acquisition')},
      'acquisitionSummary', ${rows('acquisition_summary')}, 'landingSummary', ${rows('landing_summary')}, 'steps', ${rows('steps')},
      'onboardingScreens', ${rows('onboarding_screens')}, 'onboardingSummary', ${rows('onboarding_summary')}, 'onboardingDaily', ${rows('onboarding_daily')},
      'onboardingFriction', ${rows('onboarding_friction')}, 'screens', ${rows('screens')}, 'billing', ${rows('billing')}, 'revenue', ${rows('revenue')},
      'revenueTotals', ${rows('revenue_totals')}, 'revenueActivity', ${rows('revenue_activity')}, 'revenueDaily', ${rows('revenue_daily')},
      'revenueFinancials', ${rows('revenue_financials')}, 'revenueSources', ${rows('revenue_sources')}, 'revenueCountries', ${rows('revenue_countries')}, 'revenueProceedsDaily', ${rows('revenue_proceeds_daily')}, 'revenueSubscriptionOverview', ${rows('revenue_subscription_overview')}, 'revenueSubscriptionProducts', ${rows('revenue_subscription_products')}, 'revenueComparison', ${rows('revenue_comparison')}, 'billingReporting', ${rows('billing_reporting')}, 'retention', ${rows('retention')}, 'retentionWeekly', ${rows('retention_weekly')}, 'retentionCoverage', ${rows('retention_coverage')}, 'featureUsage', ${rows('feature_usage')}, 'featureRetention', ${rows('feature_retention')}, 'cancellations', ${rows('cancellations')},
      'actions', ${rows('actions')}, 'releases', ${rows('releases')},
      'eventMetrics', ${rows('event_metrics')}, 'eventPlatforms', ${rows('event_platforms')}, 'dimensions', ${rows('dimensions')},
      'eventDelivery', ${rows('event_delivery')}, 'contextCoverage', ${rows('context_coverage')}, 'billingProducts', ${rows('billing_products')}, 'billingDimensions', ${rows('billing_dimensions')}
    ) as data`
}

// Deduplicate concurrent misses; the authenticated API owns snapshot caching.
const pending = new Map<string, Promise<AnalyticsDashboard>>()
export function getAnalyticsDashboard(filters: AnalyticsFilters) {
  if (['Onboarding','Purchases'].includes(filters.section ?? '') && filters.platform === 'web') filters = { ...filters, platform: 'all' }
  if (['Scans','Referrals','Notifications','AttributionLedger','Quality','Reliability'].includes(filters.section ?? '')) filters = { ...filters, platform: 'all' }
  const key = `${filters.days}:${filters.platform}:${filters.section ?? 'all'}`
  const found = pending.get(key)
  if (found) return found
  const now = new Date()
  const promise = (filters.section === 'Reliability' ? getReliabilityData(Number(filters.days)).then(reliability => {
    if (!reliability.available) throw new Error('Production telemetry snapshot unavailable')
    return ({
    reliability, generatedAt: reliability.generatedAt, queryMs: Date.now() - now.getTime(), filters,
    summary: { events: 0, actors: 0, first_opens: 0, evaluations: 0, failures: 0, latest_event: null },
    daily: [], scanLedger: { summary: { started: 0, completed: 0, failed: 0, pending: 0, reports: 0 }, daily: [] },
  } as unknown as AnalyticsDashboard) }) : filters.section === 'CreatorPerformance' ? getCreatorPerformanceSnapshot(Number(filters.days), now).then(creatorPerformance => ({
    creatorPerformance, generatedAt: now.toISOString(), queryMs: Date.now() - now.getTime(), filters,
    summary: { events: 0, actors: 0, first_opens: 0, evaluations: 0, failures: 0, latest_event: null },
    daily: [], scanLedger: { summary: { started: 0, completed: 0, failed: 0, pending: 0, reports: 0 }, daily: [] },
  } as unknown as AnalyticsDashboard)) : db.transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '12s'`)
    // This report otherwise compiles over a thousand JIT functions.
    await tx.execute(sql`set local jit = off`)
    const [row] = await tx.execute(analyticsQuery(filters, now))
    const payload = row.data as AnalyticsDashboard
    if (filters.section === 'Quality' && payload.dataHealth) payload.dataHealth.settings = { runtime: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown', exportEnabled: Boolean(process.env.POSTHOG_PROJECT_KEY), scheduler: Boolean(process.env.CRON_SECRET) }
    return { ...(row.data as Omit<AnalyticsDashboard, 'generatedAt' | 'queryMs' | 'filters'>),
      generatedAt: now.toISOString(), queryMs: Date.now() - now.getTime(), filters }
  })).finally(() => { pending.delete(key) })
  pending.set(key, promise)
  return promise
}
