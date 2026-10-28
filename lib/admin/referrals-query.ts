import {sql} from 'drizzle-orm'
import {customerAccount,customerEvent} from './audience'
import {reportingBucket} from './reporting-bucket'
import type {MetricRow} from './analytics'

export type ReferralsReport={summary:MetricRow[];daily:MetricRow[];participation:MetricRow[];rewards:MetricRow[];rewardKinds:MetricRow[];activity:MetricRow[];coverage:MetricRow[]}
const charge=sql`b.amount>0 and (
  (b.provider='stripe' and b.event_name in ('one_time_purchase','invoice_paid','subscription_renewed'))
  or (b.provider='revenuecat' and b.event_name in ('subscription_started','subscription_renewed','trial_converted','one_time_purchase')))`
const chargeType=sql`((b.provider='stripe' and b.event_name in ('one_time_purchase','invoice_paid','subscription_renewed'))
  or (b.provider='revenuecat' and b.event_name in ('subscription_started','subscription_renewed','trial_converted','one_time_purchase')))`

export function referralsCTEs(start:string,end:string,days:number){
 return sql`customer_referral_history as materialized (
    select r.referred_user_id,coalesce(g.claimed_by_user_id,r.inviter_user_id) as inviter,r.created_at at time zone 'UTC' as credited_at
    from referral_signups r left join mobile_guests g on g.user_id=r.inviter_user_id
    where r.created_at < ${end}::timestamptz
      and ${customerAccount(sql`r.referred_user_id`)} and ${customerAccount(sql`r.inviter_user_id`)}
      and ${customerAccount(sql`coalesce(g.claimed_by_user_id,r.inviter_user_id)`)}
      and r.referred_user_id<>coalesce(g.claimed_by_user_id,r.inviter_user_id)
  ), customer_referral_cohort as materialized (
    select *,credited_at+interval '7 days'<=${end}::timestamp as mature
    from customer_referral_history where credited_at>=${start}::timestamp
  ), customer_referral_client as (
    select c.referred_user_id,
      bool_or(a.platform in ('ios','android') and a.occurred_at<c.credited_at+interval '7 days') as mobile7,
      bool_or(a.event_name='paywall_viewed' and a.occurred_at<c.credited_at+interval '7 days') as paywall7,
      max(a.occurred_at) as latest_event,max(a.received_at) as latest_receipt
    from customer_referral_cohort c join e a on a.account_id=c.referred_user_id and a.occurred_at>=c.credited_at
    group by c.referred_user_id
  ), customer_referral_views as (
    select c.referred_user_id,bool_or(a.occurred_at<c.credited_at+interval '7 days') as viewed7
    from customer_referral_cohort c join e a on a.account_id=c.referred_user_id and a.event_name='report_viewed' and a.occurred_at>=c.credited_at
    join analyses v on v.id=a.properties->>'report_id' and v.status='complete'
    join photos p on p.id=v.photo_id and p.source='user' and p.user_id=c.referred_user_id
    where v.id not in (select id from excluded_reports)
    group by c.referred_user_id
  ), customer_referral_billing as (
    select c.referred_user_id,bool_or(${charge} and b.occurred_at<c.credited_at+interval '7 days') as paid7,
      count(*) filter(where b.amount is null and ${chargeType} and b.occurred_at<c.credited_at+interval '7 days') as unknown_amount_records,
      max(b.received_at) as latest_receipt
    from customer_referral_cohort c join b on b.account_id=c.referred_user_id and b.occurred_at>=c.credited_at
    where ${chargeType} group by c.referred_user_id
  ), customer_referral_outcomes as materialized (
    select c.*,coalesce(a.mobile7,false) as mobile7,coalesce(a.paywall7,false) as paywall7,
      coalesce(v.viewed7,false) as viewed7,coalesce(p.paid7,false) as paid7,coalesce(p.unknown_amount_records,0) as unknown_amount_records
    from customer_referral_cohort c left join customer_referral_client a using(referred_user_id)
    left join customer_referral_views v using(referred_user_id) left join customer_referral_billing p using(referred_user_id)
  ), referrals_summary as (
    select count(*) as signups,count(distinct inviter) as inviters,count(*) filter(where mature) as eligible,
      count(*) filter(where not mature) as pending,
      count(*) filter(where mature and mobile7) as mobile7,count(*) filter(where mature and paywall7) as paywall7,
      count(*) filter(where mature and viewed7) as viewed7,count(*) filter(where mature and paid7) as paid7
    from customer_referral_outcomes
  ), referrals_daily_raw as (
    select ${reportingBucket(sql`credited_at`,days)} as day,count(*) as signups from customer_referral_cohort group by 1
  ), referrals_buckets as (
    select distinct day from (select ${reportingBucket(sql`points.at`,days)} as day
      from generate_series(${start}::timestamp,${end}::timestamp,interval '1 hour') points(at)) buckets
    where day::timestamptz<${end}::timestamptz
  ), referrals_daily as (
    select d.day,coalesce(r.signups,0) as signups from referrals_buckets d left join referrals_daily_raw r using(day) order by d.day
  ), referrals_inviter_counts as (
    select inviter,count(*) as signups,count(*) filter(where mature) as eligible,
      count(*) filter(where mature and viewed7) as viewed7,count(*) filter(where mature and paid7) as paid7
    from customer_referral_outcomes group by inviter
  ), referrals_participation as (
    select case when signups=1 then 'one' when signups=2 then 'two' else 'three_plus' end as contribution,
      count(*) as inviters,sum(signups) as credited_signups,sum(eligible) as eligible,sum(viewed7) as viewed7,sum(paid7) as paid7
    from referrals_inviter_counts group by 1 order by min(signups)
  ), customer_referral_rewards as materialized (
    select p.id as entitlement_id,p.created_at,p.updated_at,p.credit_balance,p.credit_expires_at,p.subscription_status,p.source,
      case when p.source='referral_self_signup_revoked' then 'revoked'
        when p.stripe_checkout_session_id like 'referral_reward:%' then 'one_time'
        when p.stripe_checkout_session_id like 'referral_signup:%' then 'legacy_signup' else 'other' end as kind,
      case when p.source='referral_reward' and (p.credit_expires_at is null or p.credit_expires_at>${end}::timestamp)
        and coalesce(p.subscription_status,'') not in ('refunded','disputed') then greatest(p.credit_balance,0) else 0 end as available
    from payment_entitlements p where p.source in ('referral_reward','referral_self_signup_revoked')
      and p.created_at<${end}::timestamp and p.id not in (select id from excluded_entitlements)
      and ${customerAccount(sql`p.user_id`)}
  ), referrals_reward_usage as (
    select count(*) filter(where r.status='complete') as completed_scans
    from scan_reservations r join customer_referral_rewards p on p.entitlement_id=r.entitlement_id
    where r.created_at>=${start}::timestamp and r.created_at<${end}::timestamp and ${customerAccount(sql`r.user_id`)}
  ), referrals_rewards as (
    select count(*) as lifetime_records,count(*) filter(where created_at>=${start}::timestamp) as period_records,
      coalesce(sum(available),0) as available_credits,max(updated_at) as latest_update,
      (select completed_scans from referrals_reward_usage) as completed_scans
    from customer_referral_rewards
  ), referrals_reward_kinds as (
    select kind,count(*) as lifetime_records,count(*) filter(where created_at>=${start}::timestamp) as period_records,
      coalesce(sum(available),0) as available_credits
    from customer_referral_rewards group by kind order by kind
  ), referrals_activity_events as materialized (
    select event_name,account_id,actor,occurred_at,received_at from e where event_name in ('referral_invite_opened','referral_invite_created')
    union all
    select event_name,account_id,null::text,occurred_at,received_at from analytics_events a
    where a.event_name='referral_reward_notification_sent' and a.environment='production' and ${customerEvent('a')}
      and a.occurred_at>=${start}::timestamp and a.occurred_at<${end}::timestamp
  ), referrals_activity as (
    select event_name,count(*) as events,count(distinct actor) as devices,count(distinct account_id) as accounts
    from referrals_activity_events group by event_name order by event_name
  ), referrals_coverage as (
    select (select max(credited_at) from customer_referral_history) as latest_credited_signup,
      (select max(latest_event) from customer_referral_client) as latest_referred_activity,
      (select max(latest_receipt) from customer_referral_client) as latest_referred_receipt,
      (select max(latest_receipt) from customer_referral_billing) as latest_billing_receipt,
      (select coalesce(sum(unknown_amount_records),0) from customer_referral_outcomes where mature) as unknown_amount_records,
      (select max(occurred_at) from referrals_activity_events) as latest_invite_event,
      (select max(received_at) from referrals_activity_events) as latest_invite_receipt
  ), referrals as (
    select json_build_object(
      'summary',(select json_agg(r) from referrals_summary r),'daily',(select json_agg(r) from referrals_daily r),
      'participation',coalesce((select json_agg(r) from referrals_participation r),'[]'::json),
      'rewards',(select json_agg(r) from referrals_rewards r),
      'rewardKinds',coalesce((select json_agg(r) from referrals_reward_kinds r),'[]'::json),
      'activity',coalesce((select json_agg(r) from referrals_activity r),'[]'::json),
      'coverage',(select json_agg(r) from referrals_coverage r)
    ) as report
  )`
}
