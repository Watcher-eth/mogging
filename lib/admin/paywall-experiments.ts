import { sql } from 'drizzle-orm'

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
        and event_name in ('paywall_plan_viewed','onboarding_interaction','purchase_failed','checkout_started','checkout_completed')
    ), paywall_test_exposure as (
      select distinct on (experiment_id, unit) experiment_id, unit, arm, occurred_at as exposed_at,
        properties->>'paywall_experiment_surface' as surface,
        properties->>'paywall_experiment_kind' as kind,
        coalesce(nullif(properties->>'browser_family',''), 'unknown') as browser,
        (properties->>'paywall_experiment_ends_at')::bigint as ends_at,
        (properties->>'paywall_experiment_minimum')::integer as minimum_per_arm
      from paywall_test_events
      where event_name = 'paywall_plan_viewed' and platform = 'web'
        and properties->>'paywall_experiment_surface' in ('mobile','desktop')
        and properties->>'paywall_experiment_kind' in ('price','length')
        and properties->>'paywall_experiment_ends_at' ~ '^[0-9]{13}$'
        and properties->>'paywall_experiment_minimum' ~ '^[0-9]{3,6}$'
        and (extract(epoch from occurred_at at time zone 'UTC') * 1000) < (properties->>'paywall_experiment_ends_at')::bigint
      order by experiment_id, unit, occurred_at
    ), paywall_test_browser as (
      select x.*, x.exposed_at + interval '24 hours' <= ${end}::timestamp as mature,
        coalesce(o.tapped, false) as tapped, coalesce(o.checkout, false) as checkout,
        coalesce(o.failed, false) as failed, p.session_id is not null as paid,
        case when p.properties->>'currency' = 'usd' then (p.properties->>'price')::numeric else null end as first_charge_usd
      from paywall_test_exposure x
      left join lateral (
        select
          bool_or(e.platform = 'web' and e.event_name = 'onboarding_interaction' and e.properties->>'action' = 'checkout_tapped') as tapped,
          bool_or(e.platform = 'server' and e.event_name = 'checkout_started') as checkout,
          bool_or(e.platform = 'web' and e.event_name = 'purchase_failed') as failed
        from paywall_test_events e
        where e.experiment_id = x.experiment_id and e.unit = x.unit and e.arm = x.arm
          and e.occurred_at >= x.exposed_at - case when e.platform = 'server' then interval '5 minutes' else interval '0' end
          and e.occurred_at < x.exposed_at + interval '24 hours'
      ) o on true
      left join lateral (
        select e.session_id, e.properties
        from paywall_test_events e
        where e.experiment_id = x.experiment_id and e.unit = x.unit and e.arm = x.arm
          and e.occurred_at >= x.exposed_at - case when e.platform = 'server' then interval '5 minutes' else interval '0' end
          and e.occurred_at < x.exposed_at + interval '24 hours'
          and e.event_name = 'checkout_completed' and e.platform = 'server' and e.source = 'stripe_verified'
          and e.properties->>'mode' = 'subscription' and e.properties->>'status' = 'paid'
          and case when jsonb_typeof(e.properties->'price') = 'number' then (e.properties->>'price')::numeric > 0 else false end
        order by e.occurred_at, e.session_id limit 1
      ) p on true
    ), paywall_experiments as (
      select experiment_id, surface, kind, arm, coalesce(browser, 'all') as browser,
        max(ends_at) as ends_at, max(minimum_per_arm) as minimum_per_arm,
        count(*) as exposed, count(*) filter (where mature) as mature,
        count(*) filter (where mature and tapped) as tapped,
        count(*) filter (where mature and checkout) as checkouts,
        count(*) filter (where mature and failed) as checkout_failures,
        count(*) filter (where mature and paid) as paid,
        count(*) filter (where mature and first_charge_usd is not null) as paid_usd,
        coalesce(sum(first_charge_usd) filter (where mature), 0) as first_charge_usd_cents
      from paywall_test_browser
      group by experiment_id, surface, kind, arm, grouping sets ((browser), ())
      order by max(ends_at) desc, experiment_id, surface, browser, arm
    )`
}
