import { sql } from 'drizzle-orm'
import { customerAccount, customerEvent } from './audience'

// Signup cohorts follow subsequent activation through the report's cutoff, not just client claims.
export function referralOutcomeCTEs(start: string, end: string) {
  return sql`referral_cohort as materialized (
    select * from referral_signups r where r.created_at >= ${start}::timestamptz and r.created_at < ${end}::timestamptz
      and ${customerAccount(sql`r.inviter_user_id`)} and ${customerAccount(sql`r.referred_user_id`)}
  ), referral_outcomes as (
    select r.referred_user_id, r.inviter_user_id,
      coalesce(bool_or(a.platform in ('ios','android')),false) as mobile_active,
      coalesce(bool_or(a.event_name = 'photo_selected'),false) as photo_selected,
      coalesce(bool_or(a.event_name = 'paywall_viewed'),false) as paywall,
      coalesce(bool_or(a.event_name = 'purchase_started'),false) as purchase_attempted,
      coalesce(bool_or(a.event_name = 'report_viewed' and exists (
        select 1 from analyses v join photos p on p.id = v.photo_id
        where v.status = 'complete' and v.id = a.properties->>'report_id' and v.id not in (select id from excluded_reports) and p.user_id = r.referred_user_id and p.source = 'user'
      )),false) as report_viewed,
      exists(select 1 from analyses v join photos p on p.id = v.photo_id where p.user_id = r.referred_user_id
        and p.source = 'user' and v.status = 'complete' and v.id not in (select id from excluded_reports)
        and v.created_at >= r.created_at at time zone 'UTC' and v.created_at < ${end}::timestamp) as report_created,
      exists(select 1 from subscription_events b where b.account_id = r.referred_user_id and b.environment = 'production'
        and b.event_name in ('subscription_started','trial_converted','one_time_purchase')
        and b.occurred_at >= r.created_at at time zone 'UTC' and b.occurred_at < ${end}::timestamp) as paid
    from referral_cohort r left join analytics_events a on a.account_id = r.referred_user_id
      and a.occurred_at >= r.created_at at time zone 'UTC' and a.occurred_at < ${end}::timestamp
      and ${customerEvent('a')}
    group by r.referred_user_id,r.inviter_user_id,r.created_at
  )`
}

export function deliveryOutcomeCTEs(start: string, end: string) {
  return sql`customer_reports as materialized (
    select a.*,p.user_id from analyses a join photos p on p.id = a.photo_id where p.source = 'user'
      and a.created_at < ${end}::timestamp and a.id not in (select id from excluded_reports)
      and ${customerAccount(sql`p.user_id`)}
  ), delivery_accounts as (
    select account_id as user_id from subscription_events where environment = 'production'
      and event_name in ('one_time_purchase','subscription_started','trial_converted')
      and occurred_at >= ${start}::timestamp and occurred_at < ${end}::timestamp and account_id is not null
      and ${customerAccount(sql`account_id`)}
    union select r.user_id from scan_reservations r where r.status in ('failed','complete','pending')
      and r.created_at >= ${start}::timestamp and r.created_at < ${end}::timestamp
      and r.entitlement_id not in (select id from excluded_entitlements)
  ), delivery_outcomes as (
    select d.user_id,
      (select count(*) from customer_reports r where r.user_id=d.user_id and r.status='complete' and r.created_at >= ${start}::timestamp) as completed_reports,
      (select count(*) from customer_reports r where r.user_id=d.user_id and r.status='failed' and r.created_at >= ${start}::timestamp) as failed_reports,
      (select count(*) from scan_reservations s where s.user_id=d.user_id and s.status='failed'
        and s.entitlement_id not in (select id from excluded_entitlements)
        and s.created_at >= ${start}::timestamp and s.created_at < ${end}::timestamp) as failed_attempts,
      (select coalesce(sum(p.credit_balance),0) from payment_entitlements p where p.user_id=d.user_id
        and p.created_at < ${end}::timestamp and p.id not in (select id from excluded_entitlements)
        and (p.credit_expires_at is null or p.credit_expires_at > ${end}::timestamp)
        and coalesce(p.subscription_status,'') not in ('refunded','disputed')) as available_credits,
      (select max(a.occurred_at) from analytics_events a where a.account_id=d.user_id and a.event_name='report_viewed'
        and ${customerEvent('a')} and a.occurred_at < ${end}::timestamp and a.occurred_at >= ${start}::timestamp
        and exists(select 1 from customer_reports r where r.id=a.properties->>'report_id' and r.user_id=d.user_id and r.status='complete')) as last_report_view,
      (select max(r.created_at) from customer_reports r where r.user_id=d.user_id and r.status='complete') as last_completed,
      (select max(s.created_at) from scan_reservations s where s.user_id=d.user_id and s.status='failed'
        and s.created_at < ${end}::timestamp and s.entitlement_id not in (select id from excluded_entitlements)) as last_failed
    from delivery_accounts d
  ), delivery_status as (
    select *,case when completed_reports = 0 and failed_attempts = 0 and failed_reports = 0 then 'Paid · no report attempt recorded'
      when last_failed > coalesce(last_completed,'epoch') then 'Needs attention · latest attempt failed'
      when failed_reports > 0 then 'Report delivered · earlier failed reports remain'
      when failed_attempts > 0 then 'Report delivered after a failure'
      when last_report_view is not null then 'Report delivered and viewed'
      else 'Report saved · viewing unconfirmed' end as status from delivery_outcomes
  )`
}
