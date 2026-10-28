import { sql } from 'drizzle-orm'

// Shared reporting policy. Keep raw telemetry; exclusions change reporting, never access or credits.
export function audienceCTEs() {
  return sql`internal_accounts as materialized (select id from users where analytics_internal),
    internal_identities as materialized (
      select distinct mobile_install_id, anonymous_id from analytics_events
      where account_id in (select id from internal_accounts)
    ), sandbox_transactions as materialized (
      select distinct transaction_id from subscription_events b where environment = 'sandbox' and transaction_id is not null
        and not exists(select 1 from subscription_events live where live.environment = 'production' and live.transaction_id = b.transaction_id)
    ), sandbox_sessions as materialized (
      select distinct session_id from analytics_events where session_id is not null
        and (properties->>'runtime_environment' = 'sandbox' or properties->>'store_environment' = 'sandbox'
          or properties->>'transaction_id' in (select transaction_id from sandbox_transactions))
    ), excluded_entitlements as materialized (
      select id from payment_entitlements p where p.user_id in (select id from internal_accounts)
        or p.mobile_install_id in (select mobile_install_id from internal_identities where mobile_install_id is not null)
        or coalesce(p.metadata->>'sandbox','false') = 'true' or p.metadata->>'livemode' = 'false'
        or p.source in ('release_verification','internal_release_verification','internal_test','smoke_test')
        or (p.source in ('subscription_allowance','revenuecat_subscription')
          and split_part(p.stripe_checkout_session_id,':',3) in (select transaction_id from sandbox_transactions))
    ), excluded_reports as materialized (
      select distinct r.result->'analysis'->>'id' as id from scan_reservations r
      where r.entitlement_id in (select id from excluded_entitlements)
        and r.result->'analysis'->>'id' is not null
        and not exists(select 1 from scan_reservations c where c.result->'analysis'->>'id' = r.result->'analysis'->>'id'
          and c.entitlement_id not in (select id from excluded_entitlements))
    )`
}

export function eventAudience(alias: string) {
  const a = sql.identifier(alias)
  return sql`case
    when ${a}.account_id in (select id from internal_accounts)
      or ${a}.mobile_install_id in (select mobile_install_id from internal_identities where mobile_install_id is not null)
      or ${a}.anonymous_id in (select anonymous_id from internal_identities where anonymous_id is not null) then 'internal'
    when ${a}.properties->>'runtime_environment' = 'sandbox' or ${a}.properties->>'store_environment' = 'sandbox'
      or ${a}.session_id in (select session_id from sandbox_sessions) then 'sandbox'
    when ${a}.environment <> 'production' or ${a}.properties->>'runtime_environment' in ('development','test') then 'non-production'
    when coalesce(${a}.properties->>'path','') ~ '^/(creator|admin)(/|$)'
      or ${a}.properties->>'surface' in ('creator_portal','creator_dashboard') then 'creator / admin'
    else 'customer' end`
}
export function customerEvent(alias: string) { return sql`${eventAudience(alias)} = 'customer'` }
export function customerAccount(account: import('drizzle-orm').SQL) {
  return sql`(${account} is null or ${account} not in (select id from internal_accounts))`
}
