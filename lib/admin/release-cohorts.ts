import {sql} from 'drizzle-orm'
import {audienceCTEs,customerEvent,customerAccount} from './audience'

// Exposure cohorts, not an A/B experiment. Attribute each verified first payment
// to one most recent preceding paywall; never credit a payment to two releases.
export function releaseCohortsQuery(days: number, now = new Date()) {
  const end=now.toISOString(), start=new Date(+now-days*86400_000).toISOString()
  return sql`with ${audienceCTEs()},
    e as materialized (
      select a.*,coalesce('install:'||mobile_install_id,'account:'||account_id,'anonymous:'||anonymous_id) as actor
      from analytics_events a where a.occurred_at>=${start}::timestamp-interval '30 days'
        and a.occurred_at<${end}::timestamp and a.platform in ('ios','android') and ${customerEvent('a')}
    ), identities as (
      select mobile_install_id,min(account_id) as account_id from e where account_id is not null and mobile_install_id is not null
      group by mobile_install_id having count(distinct account_id)=1
    ), exposure as (
      select distinct on(a.actor,a.platform,a.app_version)
        a.actor,a.platform,coalesce(a.app_version,'unknown') as release,a.occurred_at as at,
        a.mobile_install_id,coalesce(a.account_id,i.account_id) as account_id,
        nullif(a.properties->>'onboarding_version','') as onboarding_version,
        nullif(a.properties->>'paywall_version','') as paywall_version
      from e a left join identities i using(mobile_install_id)
      where a.event_name='paywall_viewed' and a.actor is not null
      order by a.actor,a.platform,a.app_version,a.occurred_at
    ), first_payments as materialized (
      select distinct on(account_id) id,account_id,occurred_at as paid_at from subscription_events
      where environment='production' and amount>0 and account_id is not null
        and event_name in ('subscription_started','trial_converted','invoice_paid','one_time_purchase')
        and ${customerAccount(sql`account_id`)} order by account_id,occurred_at,id
    ), assigned as (
      select b.*,x.actor,x.platform,x.release from first_payments b
      join lateral (select x.* from exposure x where x.account_id=b.account_id and x.at<=b.paid_at
        and b.paid_at<x.at+interval '7 days' order by x.at desc,x.actor limit 1) x on true
      where x.at>=${start}::timestamp and b.paid_at<${end}::timestamp
    ), outcomes as (
      select b.*,
        b.paid_at<=${end}::timestamp-interval '24 hours' as mature24,
        b.paid_at<=${end}::timestamp-interval '7 days' as mature7,
        exists(select 1 from e a where a.account_id=b.account_id and a.event_name='report_viewed'
          and a.occurred_at>=b.paid_at and a.occurred_at<b.paid_at+interval '24 hours'
          and exists(select 1 from analyses report join photos photo on photo.id=report.photo_id
            where photo.user_id=b.account_id and photo.source='user' and report.status='complete'
              and report.id=coalesce(a.properties->>'report_id',a.properties->>'evaluation_id')
              and report.id not in(select id from excluded_reports))) as viewed24,
        exists(select 1 from subscription_events s where s.account_id=b.account_id and s.environment='production'
          and s.event_name='cancellation_scheduled' and s.occurred_at>=b.paid_at and s.occurred_at<b.paid_at+interval '24 hours') as canceled24,
        exists(select 1 from subscription_events s where s.account_id=b.account_id and s.environment='production'
          and s.event_name='subscription_refunded' and s.occurred_at>=b.paid_at and s.occurred_at<b.paid_at+interval '7 days') as refunded7,
        exists(select 1 from e a where a.account_id=b.account_id and a.event_name='protocol_task_completed'
          and a.occurred_at>=b.paid_at and a.occurred_at<b.paid_at+interval '7 days') as task7,
        exists(select 1 from scan_reservations r
          cross join lateral (select first.created_at,first.result->'analysis'->>'id' as report_id
            from scan_reservations first where first.user_id=b.account_id and first.status='complete'
              and first.created_at>=b.paid_at and first.result->'analysis'->>'id' is not null
              and first.entitlement_id not in(select id from excluded_entitlements)
            order by first.created_at,first.id limit 1) first
          where r.user_id=b.account_id and r.status='complete'
          and r.created_at<b.paid_at+interval '7 days'
          and r.entitlement_id not in(select id from excluded_entitlements)
          and r.created_at>=first.created_at+interval '24 hours'
          and r.result->'analysis'->>'id'<>first.report_id) as repeat_scan7
      from assigned b
    ), exposure_counts as (
      select platform,release,min(at) as first_paywall,count(*)::int as paywall_devices,
        count(*) filter(where account_id is not null)::int as linked_devices,
        count(*) filter(where onboarding_version is not null)::int as onboarding_tagged,
        count(*) filter(where paywall_version is not null)::int as paywall_tagged
      from exposure where at>=${start}::timestamp group by 1,2
    ), outcome_counts as (
      select platform,release,count(*)::int as verified_buyers,
        count(*) filter(where mature24)::int as eligible24,
        count(*) filter(where mature24 and viewed24)::int as report_viewed24,
        count(*) filter(where mature24 and canceled24)::int as canceled24,
        count(*) filter(where mature7)::int as eligible7,
        count(*) filter(where mature7 and refunded7)::int as refunded7,
        count(*) filter(where mature7 and task7)::int as task7,
        count(*) filter(where mature7 and repeat_scan7)::int as repeat_scan7
      from outcomes group by 1,2
    ), releases as (
      select platform,coalesce(app_version,'unknown') as release,min(occurred_at) as first_seen,
        count(distinct actor) filter(where event_name='app_first_open')::int as first_opens,
        count(distinct actor)::int as active_devices
      from e where occurred_at>=${start}::timestamp group by 1,2
    ) select r.*,x.first_paywall,coalesce(x.paywall_devices,0) as paywall_devices,
      x.linked_devices,x.onboarding_tagged,x.paywall_tagged,
      coalesce(o.verified_buyers,0) as verified_buyers,coalesce(o.eligible24,0) as eligible24,
      case when o.eligible24>0 then o.report_viewed24 end as report_viewed24,
      case when o.eligible24>0 then o.canceled24 end as canceled24,
      coalesce(o.eligible7,0) as eligible7,
      case when o.eligible7>0 then o.refunded7 end as refunded7,
      case when o.eligible7>0 then o.task7 end as task7,
      case when o.eligible7>0 then o.repeat_scan7 end as repeat_scan7
    from releases r left join exposure_counts x using(platform,release)
      left join outcome_counts o using(platform,release) order by r.first_seen desc`
}
