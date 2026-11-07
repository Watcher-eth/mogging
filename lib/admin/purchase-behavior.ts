import {sql} from 'drizzle-orm'
import {scanProducts} from '@/lib/payments/revenuecat'
import {customerAccount} from './audience'
import {reportingBucket, reportingCalendar} from './reporting-bucket'
import type {MetricRow} from './analytics'

export type PurchaseBehavior = {
  sources?: MetricRow[]; summary: MetricRow[]; daily: MetricRow[]; products: MetricRow[]; combinations: MetricRow[];
  frequency: MetricRow[]; firstPurchase: MetricRow[]; signupWindows: MetricRow[]; repeatWindows: MetricRow[];
}

// Billing is independent of client attempts and platform filters. Unknown identity
// stays outside people/cohort denominators; a webhook retry is never another order.
export function purchaseBehaviorCTEs(start: string, end: string, days: number) {
  return sql`purchase_order_history as materialized (
    select distinct on (provider,coalesce(transaction_id,provider_event_id)) *,
      coalesce('account:' || account_id,provider || ':external:' || external_user_id) as customer,
      case ${sql.join(scanProducts.map(p=>sql`when product_id in (${p.productId},${p.product}) then ${p.credits === 1 ? 'single_scan' : 'scan_bundle'}`),sql` `)}
        when event_name in ('subscription_started','subscription_renewed','trial_converted','invoice_paid') then 'subscription'
        else 'other' end as kind,
      case when provider='stripe' then 'stripe'
        when properties->>'store'='APP_STORE' then 'app_store'
        when properties->>'store' in ('PLAY_STORE','GOOGLE_PLAY') then 'google_play' else 'other' end as payment_source
    from billing_history where amount>0
      and event_name in ('one_time_purchase','subscription_started','subscription_renewed','trial_converted','invoice_paid')
    order by provider,coalesce(transaction_id,provider_event_id),occurred_at,received_at,id
  ), purchase_orders as materialized (
    select * from purchase_order_history where occurred_at>=${start}::timestamp
  ), purchase_people as materialized (
    select customer,min(occurred_at) as first_paid,
      count(*) filter(where kind='single_scan') as single_orders,
      count(*) filter(where kind='scan_bundle') as bundle_orders,
      count(*) filter(where kind='subscription') as subscription_payments,
      min(occurred_at) filter(where kind='subscription' and event_name<>'subscription_renewed') as first_subscription
    from purchase_order_history where customer is not null group by customer
  ), purchase_period_people as (
    select h.* from purchase_people h where exists(select 1 from purchase_orders p where p.customer=h.customer)
  ), purchase_behavior_summary as (
    select count(*) as purchases,count(distinct customer) as buyers,
      count(*) filter(where customer is null) as unidentified_purchases,
      count(*) filter(where kind='single_scan') as single_scans,
      count(*) filter(where kind='scan_bundle') as bundles,
      count(*) filter(where kind='subscription') as subscription_payments,
      count(*) filter(where event_name='subscription_renewed') as renewals,
      count(*) filter(where kind='other') as other_purchases,
      (select count(*) from billing_history where occurred_at>=${start}::timestamp and amount is null and event_name in ('one_time_purchase','subscription_started','subscription_renewed','trial_converted','invoice_paid')) as unpriced_events,
      (select count(*) from purchase_period_people where single_orders+bundle_orders>=2) as repeat_scan_buyers,
      (select count(*) from purchase_people where first_paid>=${start}::timestamp) as first_buyers,
      (select count(*) from purchase_people p join users u on p.customer='account:' || u.id
        where p.first_paid>=${start}::timestamp and u.created_at<=p.first_paid) as timing_linked_first_buyers
    from purchase_orders
  ), purchase_daily_counts as (
    select ${reportingBucket(sql`occurred_at`,days)} as day,count(*) as purchases,
      count(*) filter(where payment_source='stripe') as stripe,
      count(*) filter(where payment_source='app_store') as app_store,
      count(*) filter(where payment_source='google_play') as google_play,
      count(*) filter(where payment_source='other') as other
    from purchase_orders group by 1 order by 1
  ), purchase_behavior_calendar as (${reportingCalendar(start,end,days)}), purchase_behavior_daily as (
    select c.day,coalesce(d.purchases,0) as purchases,coalesce(d.stripe,0) as stripe,
      coalesce(d.app_store,0) as app_store,coalesce(d.google_play,0) as google_play,coalesce(d.other,0) as other
    from purchase_behavior_calendar c left join purchase_daily_counts d using(day) order by c.day
  ), purchase_behavior_products as (
    select kind,count(*) as purchases,count(distinct customer) as buyers,
      count(*) filter(where customer is null) as unidentified_purchases,
      count(*) filter(where event_name='subscription_renewed') as renewals
    from purchase_orders group by kind order by purchases desc,kind
  ), purchase_behavior_sources as (
    select payment_source,count(*) as purchases,count(distinct customer) as buyers,
      count(*) filter(where kind='single_scan') as single_scans,count(*) filter(where kind='scan_bundle') as bundles,
      count(*) filter(where kind='subscription') as subscription_payments,
      count(*) filter(where event_name='subscription_renewed') as renewals,
      count(distinct customer) filter(where occurred_at=(select first_paid from purchase_people p where p.customer=purchase_orders.customer)) as first_buyers
    from purchase_orders group by payment_source order by purchases desc,payment_source
  ), purchase_behavior_combinations as (
    select case when subscription_payments>0 and single_orders+bundle_orders>0 then 'scans_and_subscription'
      when subscription_payments>0 then 'subscription_only'
      when single_orders>0 and bundle_orders>0 then 'single_and_bundle'
      when bundle_orders>0 then 'bundle_only' when single_orders>0 then 'single_only' else 'other' end as combination,
      count(*) as buyers from purchase_period_people group by 1 order by buyers desc,combination
  ), purchase_behavior_frequency as (
    select case when single_orders+bundle_orders=1 then '1' when single_orders+bundle_orders=2 then '2' else '3+' end as scan_orders,
      count(*) as buyers,count(*) filter(where subscription_payments>0) as also_subscription
    from purchase_period_people where single_orders+bundle_orders>0 group by 1 order by 1
  ), purchase_signup_timing as materialized (
    select p.customer,p.first_paid,u.created_at as signed_up from purchase_people p
    join users u on p.customer='account:' || u.id where u.created_at<=p.first_paid
  ), purchase_first_timing as (
    select case when first_paid<signed_up+interval '1 day' then 1 when first_paid<signed_up+interval '3 days' then 3
      when first_paid<signed_up+interval '7 days' then 7 when first_paid<signed_up+interval '14 days' then 14 else 15 end as bucket,
      count(*) as buyers from purchase_signup_timing where first_paid>=${start}::timestamp group by 1 order by 1
  ), purchase_signup_windows as (
    select n.days as window_days,count(u.id) as accounts,
      count(u.id) filter(where u.created_at<=${end}::timestamp-n.days*interval '1 day') as eligible,
      count(u.id) filter(where u.created_at>${end}::timestamp-n.days*interval '1 day') as pending,
      count(u.id) filter(where u.created_at<=${end}::timestamp-n.days*interval '1 day'
        and p.first_paid<u.created_at+n.days*interval '1 day' and p.first_paid>=u.created_at) as buyers
    from (values(1),(3),(7),(14)) n(days) left join users u on u.created_at>=${start}::timestamp
      and u.created_at<${end}::timestamp and ${customerAccount(sql`u.id`)}
    left join purchase_people p on p.customer='account:' || u.id group by n.days order by n.days
  ), purchase_repeat_windows as (
    select n.days as window_days,count(p.customer) as first_buyers,
      count(p.customer) filter(where p.first_paid<=${end}::timestamp-n.days*interval '1 day') as eligible,
      count(p.customer) filter(where p.first_paid>${end}::timestamp-n.days*interval '1 day') as pending,
      count(p.customer) filter(where p.first_paid<=${end}::timestamp-n.days*interval '1 day' and exists(
        select 1 from purchase_order_history o where o.customer=p.customer and o.kind in ('single_scan','scan_bundle')
          and o.occurred_at>p.first_paid and o.occurred_at<p.first_paid+n.days*interval '1 day')) as repeat_scan_buyers,
      count(p.customer) filter(where p.first_paid<=${end}::timestamp-n.days*interval '1 day'
        and p.first_subscription>p.first_paid and p.first_subscription<p.first_paid+n.days*interval '1 day') as later_subscribers
    from (values(1),(3),(7),(14)) n(days) left join purchase_people p on p.first_paid>=${start}::timestamp
      group by n.days order by n.days
  ), purchase_behavior as (
    select json_build_object('summary',(select json_agg(r) from purchase_behavior_summary r),
      'daily',coalesce((select json_agg(r) from purchase_behavior_daily r),'[]'::json),
      'products',coalesce((select json_agg(r) from purchase_behavior_products r),'[]'::json),
      'sources',coalesce((select json_agg(r) from purchase_behavior_sources r),'[]'::json),
      'combinations',coalesce((select json_agg(r) from purchase_behavior_combinations r),'[]'::json),
      'frequency',coalesce((select json_agg(r) from purchase_behavior_frequency r),'[]'::json),
      'firstPurchase',coalesce((select json_agg(r) from purchase_first_timing r),'[]'::json),
      'signupWindows',coalesce((select json_agg(r) from purchase_signup_windows r),'[]'::json),
      'repeatWindows',coalesce((select json_agg(r) from purchase_repeat_windows r),'[]'::json)) as report
  )`
}
