import { audienceCTEs, customerAccount } from './audience'
import { referralOutcomeCTEs, deliveryOutcomeCTEs } from './customer-outcomes'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { analyticsFilters, type MetricRow } from './analytics'

export const operationalFilters = analyticsFilters.pick({ days: true }).extend({
  section: z.enum(['Authentication','Purchases','Referrals','Scans','Notifications','AttributionLedger']),
})
export type OperationalFilters = z.infer<typeof operationalFilters>
export type OperationalData = { rows: MetricRow[]; detail: MetricRow[] }
export function operationalQuery({ section, days }: OperationalFilters, now: Date) {
  const start = new Date(now.getTime() - Number(days) * 86400_000).toISOString()
  const end = now.toISOString()
  const window = (field: string) => sql`${sql.identifier(field)} >= ${start}::timestamp and ${sql.identifier(field)} < ${end}::timestamp`
  const rows = section === 'Authentication' ? sql`select platform, count(*) as links, count(distinct account_id) as accounts from analytics_identity_links where ${window('linked_at')} and ${customerAccount(sql`account_id`)} group by platform`
    : section === 'Purchases' ? sql`select case when consumed_at is not null then 'Consumed' when expires_at <= ${end}::timestamp then 'Expired, unconsumed' else 'Awaiting consumption' end as status, count(*) as handoffs, count(distinct user_id) as accounts from payment_handoffs where ${window('created_at')} and ${customerAccount(sql`user_id`)} group by 1`
    : section === 'Scans' ? sql`select status,count(*) as accounts from delivery_status group by status order by accounts desc`
    : section === 'Referrals' ? sql`select 'Credited new accounts'::text as milestone,count(*) as accounts from referral_outcomes
      union all select 'Signed in on mobile',count(*) from referral_outcomes where mobile_active
      union all select 'Photo selected',count(*) from referral_outcomes where photo_selected
      union all select 'Paywall reached',count(*) from referral_outcomes where paywall
      union all select 'Purchase attempted',count(*) from referral_outcomes where purchase_attempted
      union all select 'Confirmed production purchase',count(*) from referral_outcomes where paid
      union all select 'Report created',count(*) from referral_outcomes where report_created
      union all select 'Own report viewed',count(*) from referral_outcomes where report_viewed`
    : section === 'Notifications' ? sql`select environment, timezone, count(*) as devices, count(distinct user_id) as accounts, count(*) filter(where session_expires_at > ${end}::timestamptz) as valid_sessions from push_devices group by 1,2 order by devices desc limit 100`
    : sql`with events as (
      select *, 'Direct'::text as credit, tracking_link_id as credited_link from creator_attribution_events where ${window('created_at')} and lower(coalesce(metadata->>'environment','production')) != 'sandbox'
      union all select *, 'First touch'::text, first_tracking_link_id from creator_attribution_events where ${window('created_at')} and first_tracking_link_id is not null and lower(coalesce(metadata->>'environment','production')) != 'sandbox'
    ) select credit,coalesce(l.public_url, e.credited_link) as link,upper(e.currency) as currency,
      count(*) filter(where event_type = 'payment' and amount_cents > 0) as purchases,
      count(distinct attribution_key) filter(where event_type = 'payment' and amount_cents > 0) as paid_customers,
      coalesce(sum(amount_cents) filter(where event_type = 'payment' and amount_cents > 0),0)::numeric / 100 as gross,
      -coalesce(sum(amount_cents) filter(where event_type in ('refund','dispute')),0)::numeric / 100 as reversals,
      coalesce(sum(amount_cents) filter(where event_type in ('payment','refund','dispute')),0)::numeric / 100 as net
      from events e left join creator_tracking_links l on l.id = e.credited_link group by 1,2,3 order by credit,net desc limit 200`
  const detail = section === 'Scans' ? sql`select left(md5(user_id),10) as account,status,completed_reports,failed_reports,failed_attempts,available_credits,last_completed,last_report_view from delivery_status order by last_failed desc nulls last,user_id limit 200`
    : section === 'Referrals' ? sql`select left(md5(inviter_user_id),10) as inviter,count(*) as signups,
      count(*) filter(where mobile_active) as mobile_active,count(*) filter(where paywall) as paywalls,
      count(*) filter(where paid) as paid,count(*) filter(where report_created) as reports,
      count(*) filter(where report_viewed) as reports_viewed from referral_outcomes group by inviter_user_id order by signups desc,inviter_user_id`
    : section === 'Notifications' ? sql`select kind,count(*) as records,count(distinct user_id) as accounts from push_deliveries where ${window('created_at')} group by kind order by records desc`
    : section === 'AttributionLedger' ? sql`select coalesce(l.public_url,e.tracking_link_id) as link,e.event_type::text as event,coalesce(e.metadata->>'provider','stripe or internal') as provider,count(*) as events,count(distinct e.attribution_key) as attributed_actors from creator_attribution_events e left join creator_tracking_links l on l.id = e.tracking_link_id where e.created_at >= ${start}::timestamp and e.created_at < ${end}::timestamp and lower(coalesce(e.metadata->>'environment','production')) != 'sandbox' group by 1,2,3 order by events desc limit 200`
    : sql`select null::text as metric where false`
  return sql`with ${audienceCTEs()}, ${section === 'Referrals' ? referralOutcomeCTEs(start,end) : section === 'Scans' ? deliveryOutcomeCTEs(start,end) : sql`unused as (select 1)`}, rows as (${rows}), detail as (${detail}) select json_build_object('rows',coalesce((select json_agg(r) from rows r),'[]'::json),'detail',coalesce((select json_agg(r) from detail r),'[]'::json)) as data`
}
export async function getOperationalData(filters: OperationalFilters) {
  return db.transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '8s'`)
    const [row] = await tx.execute(operationalQuery(filters, new Date()))
    return row.data as OperationalData
  })
}
