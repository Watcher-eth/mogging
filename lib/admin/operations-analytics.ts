import {sql} from 'drizzle-orm'
import {customerAccount} from './audience'
import {reportingBucket} from './reporting-bucket'
import type {MetricRow} from './analytics'
export type NotificationsData={summary:MetricRow[];daily:MetricRow[];registrations:MetricRow[];kinds:MetricRow[];coverage:MetricRow[]}
export type LedgerData={summary:MetricRow[];daily:MetricRow[];records:MetricRow[];coverage:MetricRow[]}
export type DataHealthData={summary:MetricRow[];daily:MetricRow[];sources:MetricRow[];billing:MetricRow[];backlog:MetricRow[];context:MetricRow[];settings?:{runtime:string;exportEnabled:boolean;scheduler:boolean}}

export function notificationsCTEs(start:string,end:string,days:number){return sql`notification_devices as materialized (
 select user_id,environment,timezone,session_expires_at,updated_at,install_id from push_devices where ${customerAccount(sql`user_id`)}
), notification_latest as (select distinct on(user_id) user_id,session_expires_at from notification_devices order by user_id,updated_at desc,install_id desc),
notification_claims as materialized (select kind,user_id,created_at from push_deliveries where created_at>=${start}::timestamptz and created_at<${end}::timestamptz and ${customerAccount(sql`user_id`)}),
notification_opens as materialized (select * from e where event_name='push_opened'),
notification_summary as (select
 (select count(*) from notification_devices) as endpoints,(select count(distinct user_id) from notification_devices) as accounts,
 (select count(*) from notification_latest where session_expires_at>${end}::timestamptz) as current_sessions,
 (select count(*) from notification_claims) as records,(select count(distinct user_id) from notification_claims) as record_accounts,
 (select count(*) from notification_opens) as opens,(select count(distinct actor) from notification_opens) as openers),
notification_daily as (select ${reportingBucket(sql`occurred_at`,days)} as day,count(*) as opens,count(distinct actor) as openers from notification_opens group by 1 order by 1),
notification_registrations as (select environment,count(*) as endpoints,count(distinct user_id) as accounts,count(*) filter(where session_expires_at>${end}::timestamptz) as valid_sessions,max(updated_at) as latest_update from notification_devices group by environment order by count(*) desc),
notification_kinds as (select kind,count(*) as records,count(distinct user_id) as accounts from notification_claims group by kind order by count(*) desc),
notification_coverage as (select (select max(updated_at) from notification_devices) as latest_registration,
 (select max(created_at) from notification_claims) as latest_record,(select max(occurred_at) from notification_opens) as latest_open,
 (select max(received_at) from notification_opens) as latest_receipt),
notifications as (select json_build_object('summary',(select json_agg(r) from notification_summary r),'daily',coalesce((select json_agg(r) from notification_daily r),'[]'::json),
 'registrations',coalesce((select json_agg(r) from notification_registrations r),'[]'::json),'kinds',coalesce((select json_agg(r) from notification_kinds r),'[]'::json),'coverage',(select json_agg(r) from notification_coverage r)) as report)`}

// Reuses the exact credit policy, normalized monetary time and audience exclusions
// from Creator Attribution. Record lists are bounded; headline totals are not.
export function ledgerCTEs(days:number){return sql`ledger_summary as (
 select credit,upper(currency) as currency,count(*) as records,count(*) filter(where event_type='payment' and amount_cents>0) as payments,
 coalesce(sum(amount_cents) filter(where event_type='payment' and amount_cents>0),0)::numeric/100 as gross,
 -coalesce(sum(amount_cents) filter(where event_type in ('refund','dispute')),0)::numeric/100 as reversals,
 coalesce(sum(amount_cents) filter(where event_type in ('payment','refund','dispute')),0)::numeric/100 as net,
 count(*) filter(where billing_id is not null) as billing_linked,
 count(*) filter(where billing_id is null and event_type in ('payment','refund','dispute')) as legacy_money,
 max(at) as latest_event,max(created_at) as latest_record
 from creator_credits group by 1,2
), ledger_daily as (select credit,upper(currency) as currency,${reportingBucket(sql`at`,days)} as day,count(*) as records from creator_credits group by 1,2,3 order by 3),
ledger_ranked as (select id as record_reference,credit,upper(currency) as currency,creator,handle,event_type::text as event,amount_cents::numeric/100 as amount,
 at as event_at,created_at as recorded_at,billing_id is not null as billing_linked,
 row_number() over(partition by credit,upper(currency) order by at desc,id desc) as rank from creator_credits),
ledger_records as (select record_reference,credit,currency,creator,handle,event,amount,event_at,recorded_at,case when billing_linked then 'Linked billing record' else 'No billing record linked' end as billing_link from ledger_ranked where rank<=100 order by event_at desc,record_reference),
ledger_coverage as (select (select count(*) from creator_events) as underlying_records,(select count(*) from b where amount>0 and creator_attribution_status not in ('allocated','internal','not_applicable')) as unallocated_billing_records),
attribution_ledger as (select json_build_object('summary',coalesce((select json_agg(r) from ledger_summary r),'[]'::json),'daily',coalesce((select json_agg(r) from ledger_daily r),'[]'::json),'records',coalesce((select json_agg(r) from ledger_records r),'[]'::json),'coverage',(select json_agg(r) from ledger_coverage r)) as report)`}

export function dataHealthCTEs(start:string,end:string,days:number){return sql`health_client as materialized (
 select event_name,account_id,platform,coalesce(source,'unknown') as source,coalesce(app_version,'unknown') as release,occurred_at,received_at,properties,
 case when received_at>=occurred_at then extract(epoch from received_at-occurred_at)*1000 end as lag_ms
 from analytics_events where environment='production' and platform in ('web','ios','android') and received_at>=${start}::timestamp and received_at<${end}::timestamp
), health_billing as materialized (select provider,received_at from subscription_events where environment='production' and received_at>=${start}::timestamp and received_at<${end}::timestamp),
health_summary as (select (select count(*) from health_client) as client_records,(select count(*) from health_billing) as billing_records,
 (select percentile_cont(0.9) within group(order by lag_ms) from health_client) as p90_ms,
 (select count(*) from health_client where received_at<occurred_at) as clock_skew_records,
 (select max(received_at) from health_client) as latest_client_receipt),
health_daily as (select ${reportingBucket(sql`received_at`,days)} as day,count(*) as records from health_client group by 1 order by 1),
health_sources as (select platform,source,count(*) as records,count(*) filter(where received_at<occurred_at) as clock_skew_records,
 percentile_cont(0.5) within group(order by lag_ms) as median_ms,percentile_cont(0.9) within group(order by lag_ms) as p90_ms,max(received_at) as latest_receipt from health_client group by 1,2 order by count(*) desc),
health_billing_sources as (select provider,count(*) as records,max(received_at) as latest_receipt from health_billing group by provider),
health_backlog as (select
 (select count(*) from analytics_events where environment='production' and exported_at is null) as pending_events,
 (select min(received_at) from analytics_events where environment='production' and exported_at is null) as oldest_pending_event,
 (select count(*) from subscription_events where environment='production' and exported_at is null) as pending_billing,
 (select count(*) from billing_webhook_receipts where split_part(id,':',1) in ('stripe','revenuecat') and processed_at is null and received_at<${end}::timestamp-interval '10 minutes') as unfinished_webhooks,
 (select min(received_at) from billing_webhook_receipts where split_part(id,':',1) in ('stripe','revenuecat') and processed_at is null and received_at<${end}::timestamp-interval '10 minutes') as oldest_webhook,
 (select count(*) from billing_webhook_receipts where id like 'stripe_reconciliation:%' and processed_at is null) as unfinished_recovery_jobs,
 (select count(*) from payment_entitlements p where stripe_checkout_session_id like 'cs_live_%' and not exists(select 1 from subscription_events b where b.provider='stripe' and b.provider_event_id='checkout:'||p.stripe_checkout_session_id)) as checkout_gaps,
 coalesce((select to_timestamp((state->>'coveredUntil')::double precision) at time zone 'UTC' from billing_reconciliation_state where provider='stripe'),
 (select max(occurred_at) from analytics_events where event_name='backend_billing_reconciliation' and environment='production' and source='backend')) as latest_reconciliation),
health_context as (select event_name as event,count(*) as records,count(*) filter(where account_id is not null) as with_account,
 count(*) filter(where nullif(properties->>'attempt_id','') is not null) as with_attempt,
 count(*) filter(where nullif(properties->>'report_id','') is not null) as with_report from health_client
 where event_name in ('account_auth_started','purchase_started','evaluation_started','report_viewed','course_lesson_completed') group by event_name),
data_health as (select json_build_object('summary',(select json_agg(r) from health_summary r),'daily',coalesce((select json_agg(r) from health_daily r),'[]'::json),'sources',coalesce((select json_agg(r) from health_sources r),'[]'::json),'billing',coalesce((select json_agg(r) from health_billing_sources r),'[]'::json),'backlog',(select json_agg(r) from health_backlog r),'context',coalesce((select json_agg(r) from health_context r),'[]'::json)) as report)`}
