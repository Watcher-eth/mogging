import { sql } from 'drizzle-orm'
import { ADMIN_REPORTING_TIME_ZONE } from './reporting-time'

export function paywallExperimentCTEs(end: string) {
  return sql`
    paywall_test_events as materialized (
      select event_name, occurred_at, platform, source, properties, session_id,
        properties->>'paywall_experiment_id' as experiment_id,
        properties->>'paywall_experiment_unit' as unit,
        properties->>'paywall_experiment_arm' as arm
      from reported_events
      where properties->>'paywall_experiment_id' ~ '^[a-z][a-z0-9_]{2,63}$'
        and properties->>'paywall_experiment_unit' ~ '^[a-f0-9]{32}$'
        and properties->>'paywall_experiment_arm' in ('control','treatment')
        and event_name in ('paywall_plan_viewed','paywall_viewed','onboarding_interaction','onboarding_step_viewed','onboarding_step_completed','purchase_failed','checkout_started','checkout_completed')
    ), paywall_test_exposure as (
      select distinct on (experiment_id, unit) experiment_id, unit, arm, occurred_at as exposed_at,
        properties->>'paywall_experiment_surface' as surface,
        properties->>'paywall_experiment_kind' as kind,
        properties->>'paywall_experiment_focus' as focus,
        coalesce(nullif(properties->>'browser_family',''), 'unknown') as browser,
        (properties->>'paywall_experiment_ends_at')::bigint as ends_at,
        (properties->>'paywall_experiment_minimum')::integer as minimum_per_arm
      from paywall_test_events
      where platform = 'web' and (
        (properties->>'paywall_experiment_kind' = 'onboarding' and event_name = 'onboarding_interaction' and properties->>'action' = 'experiment_entered')
        or (properties->>'paywall_experiment_kind' in ('price','length') and event_name = 'paywall_plan_viewed')
      )
        and properties->>'paywall_experiment_surface' in ('mobile','desktop')
        and properties->>'paywall_experiment_ends_at' ~ '^[0-9]{13}$'
        and properties->>'paywall_experiment_minimum' ~ '^[0-9]{3,6}$'
        and (extract(epoch from occurred_at at time zone 'UTC') * 1000) < (properties->>'paywall_experiment_ends_at')::bigint
      order by experiment_id, unit, occurred_at
    ), paywall_test_matched as materialized (
      select e.*
      from paywall_test_events e
      join paywall_test_exposure x using (experiment_id, unit, arm)
      where e.occurred_at >= x.exposed_at - case when e.platform = 'server' then interval '5 minutes' else interval '0' end
        and e.occurred_at < x.exposed_at + interval '24 hours'
        and e.event_name <> 'paywall_plan_viewed'
    ), paywall_test_actions as (
      select experiment_id, unit,
        bool_or(platform = 'web' and event_name = 'onboarding_step_viewed'
          and (properties->>'step' = 'upload' or properties->>'step' like 'capture.%')) as capture_reached,
        bool_or(platform = 'web' and event_name = 'onboarding_step_completed' and properties->>'step' in ('upload','capture.side','capture.review')) as photo_ready,
        bool_or(platform = 'web' and event_name = 'paywall_viewed') as paywall_reached,
        bool_or(platform = 'web' and event_name = 'onboarding_interaction' and properties->>'action' = 'checkout_tapped') as tapped,
        bool_or(platform = 'server' and event_name = 'checkout_started') as checkout,
        bool_or(platform = 'web' and event_name = 'purchase_failed') as failed
      from paywall_test_matched group by experiment_id, unit
    ), paywall_test_paid as (
      select distinct on (experiment_id, unit) experiment_id, unit,
        case when properties->>'currency' = 'usd' then (properties->>'price')::numeric end as first_charge_usd
      from paywall_test_matched
      where event_name = 'checkout_completed' and platform = 'server' and source = 'stripe_verified'
        and session_id is not null and properties->>'mode' = 'subscription' and properties->>'status' = 'paid'
        and case when jsonb_typeof(properties->'price') = 'number' then (properties->>'price')::numeric > 0 else false end
      order by experiment_id, unit, occurred_at, session_id
    ), paywall_test_browser as (
      select x.*, x.exposed_at + interval '24 hours' <= ${end}::timestamp as mature,
        o.capture_reached, o.photo_ready, o.paywall_reached, o.tapped, o.checkout, o.failed, p.unit is not null as paid, p.first_charge_usd
      from paywall_test_exposure x
      left join paywall_test_actions o using (experiment_id, unit)
      left join paywall_test_paid p using (experiment_id, unit)
    ), paywall_experiments as (
      select experiment_id, surface, kind, focus, arm, coalesce(browser, 'all') as browser,
        max(ends_at) as ends_at, max(minimum_per_arm) as minimum_per_arm,
        count(*) as exposed, count(*) filter (where mature) as mature,
        count(*) filter (where mature and capture_reached) as capture_reached,
        count(*) filter (where mature and photo_ready) as photo_ready,
        count(*) filter (where mature and paywall_reached) as paywall_reached,
        count(*) filter (where mature and tapped) as tapped,
        count(*) filter (where mature and checkout) as checkouts,
        count(*) filter (where mature and failed) as checkout_failures,
        count(*) filter (where paid) as observed_paid,
        count(*) filter (where mature and paid) as paid,
        count(*) filter (where mature and first_charge_usd is not null) as paid_usd,
        coalesce(sum(first_charge_usd) filter (where mature), 0) as first_charge_usd_cents
      from paywall_test_browser
      group by experiment_id, surface, kind, focus, arm, grouping sets ((browser), ())
      order by max(ends_at) desc, experiment_id, surface, browser, arm
    ), onboarding_experiment_daily as (
      select experiment_id, surface,
        to_char(date_trunc('day', exposed_at at time zone 'UTC', ${ADMIN_REPORTING_TIME_ZONE}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as day,
        count(*) filter (where arm = 'control') as control,
        count(*) filter (where arm = 'treatment') as treatment
      from paywall_test_exposure
      where kind = 'onboarding'
      group by 1,2,3 order by 3
    )`
}
