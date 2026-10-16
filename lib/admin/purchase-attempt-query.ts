import { audienceCTEs, customerEvent } from './audience'
import { createHash } from 'node:crypto'
import { sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { AnalyticsFilters } from './analytics'
import { describePurchaseAttempt, type PurchaseAttemptRow } from './purchase-attempts'

// Bound the expensive timeline view; the existing aggregate funnel remains the whole-window report.
export function purchaseAttemptsQuery(filters: AnalyticsFilters, now: Date) {
  const start = new Date(now.getTime() - Number(filters.days) * 86400_000).toISOString()
  const platform: SQL = filters.platform === 'all' ? sql`a.platform in ('ios','android')` : sql`a.platform = ${filters.platform}`
  return sql`with ${audienceCTEs()}, starts as (
    select a.properties->>'attempt_id' as id,
      coalesce(a.mobile_install_id, a.anonymous_id, a.account_id) as device,
      a.platform, coalesce(a.app_version,'unknown') as release, min(a.occurred_at) as started
    from analytics_events a where ${customerEvent('a')} and a.event_name = 'purchase_started'
      and nullif(a.properties->>'attempt_id','') is not null and ${platform}
      and a.occurred_at >= ${start}::timestamp and a.occurred_at < ${now.toISOString()}::timestamp
    group by 1,2,3,4 order by started desc limit 2001
  ), attempts as (
    select s.*, jsonb_agg(jsonb_build_object('event',a.event_name,'at',to_char(a.occurred_at,'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'properties',a.properties)
      order by a.occurred_at,a.received_at,a.id) as events,
      coalesce(bool_or(exists(select 1 from subscription_events b
        where b.provider = 'revenuecat' and b.environment = 'production'
          and b.event_name in ('subscription_started','trial_started','one_time_purchase')
          and b.transaction_id = a.properties->>'transaction_id'
          and b.product_id = a.properties->>'productId'
          and b.occurred_at >= s.started - interval '5 seconds')),false) as verified,
      coalesce(bool_or(a.properties->>'store_environment' = 'sandbox' or exists(select 1 from subscription_events b
        where b.provider = 'revenuecat' and b.environment = 'sandbox'
          and b.transaction_id = a.properties->>'transaction_id' and b.product_id = a.properties->>'productId')),false) as sandbox
    from starts s join analytics_events a on a.properties->>'attempt_id' = s.id
      and coalesce(a.mobile_install_id,a.anonymous_id,a.account_id) = s.device
      and a.platform = s.platform and a.environment = 'production'
      and a.occurred_at >= s.started and a.occurred_at >= ${start}::timestamp
      and (a.event_name like 'purchase_%' or a.event_name = 'checkout_started') and a.occurred_at < ${now.toISOString()}::timestamp
    group by s.id,s.device,s.platform,s.release,s.started
  ) select * from attempts order by started desc`
}
export async function getPurchaseAttempts(filters: AnalyticsFilters) {
  const now = new Date()
  const rows = await db.transaction(async tx => {
    await tx.execute(sql`set transaction read only`)
    await tx.execute(sql`set local statement_timeout = '8s'`)
    return tx.execute(purchaseAttemptsQuery(filters, now))
  })
  return { generatedAt: now.toISOString(), truncated: rows.length > 2000,
    attempts: (rows.slice(0,2000) as unknown as PurchaseAttemptRow[]).map(row => describePurchaseAttempt({ ...row,
      device: createHash('sha256').update(row.device ?? 'unknown').digest('hex').slice(0,10),
      started: new Date(row.started).toISOString(),
    }, now.getTime())) }
}
export type PurchaseAttemptsReport = Awaited<ReturnType<typeof getPurchaseAttempts>>
