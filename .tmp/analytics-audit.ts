import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery } from '../lib/admin/analytics'
import { operationalQuery } from '../lib/admin/operations'
import { reliabilityQuery } from '../lib/admin/reliability'
import { analyticsEventNames } from '../lib/analytics/contract'
const sql = postgres(process.env.DATABASE_URL!, {max:1,prepare:false})
const dialect = new PgDialect()
const now = new Date()
const start = new Date(now.getTime()-30*86400000).toISOString()
const result: Record<string,any> = {now:now.toISOString(),start}
try {
 await sql.begin('read only', async tx => {
  await tx`set local statement_timeout = 25000`
  const run = async (query:any) => {const q=dialect.sqlToQuery(query);return (await tx.unsafe(q.sql,q.params as any))[0].data}
  for (const platform of ['all','ios','web','android'] as const) { const t=performance.now();const d=await run(analyticsQuery({days:'30',platform},now));result[platform]=d;console.log(JSON.stringify({platform,queryMs:Math.round(performance.now()-t),summary:d.summary,revenue:d.revenue,scanLedger:d.scanLedger.summary,retention:d.retention})); }
  for (const section of ['Authentication','Purchases','Referrals','Notifications','AttributionLedger'] as const) result[section]=await run(operationalQuery({days:'30',section},now))
  result.Reliability=await run(reliabilityQuery(30,now))
  result.inventory=await tx`select platform,environment,source,count(*)::int as events,min(occurred_at)::text as first,max(occurred_at)::text as latest,count(*) filter(where coalesce(mobile_install_id,anonymous_id,account_id) is null)::int as unidentified from analytics_events where occurred_at >= ${start}::timestamp group by 1,2,3 order by events desc`
  result.backend=await tx`select properties->>'feature' as feature,properties->>'outcome' as outcome,count(*)::int as requests from analytics_events where environment='production' and source='backend' and event_name='backend_request' and occurred_at >= ${start}::timestamp group by 1,2 order by requests desc`
  result.billing=await tx`select provider,environment,event_name,currency,count(*)::int as events,sum(amount)::text as amount,count(*) filter(where amount is null)::int as missing_amounts,count(*) filter(where account_id is null)::int as unlinked from subscription_events where occurred_at >= ${start}::timestamp group by 1,2,3,4 order by events desc`
  result.receipts=await tx`select split_part(id,':',1) as provider,(processed_at is not null) as processed,count(*)::int as receipts,min(received_at)::text as first,max(received_at)::text as latest from billing_webhook_receipts group by 1,2`
  result.tables=await tx`select table_name from information_schema.tables where table_schema='public' and (table_name like '%analytics%' or table_name like '%billing%' or table_name like '%referral%' or table_name like '%scan%' or table_name like '%push%' or table_name in ('analyses','payment_entitlements','payment_handoffs','creator_attribution_events'))`
  result.unmapped=await tx`select event_name,count(*)::int as events from analytics_events where environment='production' and source is distinct from 'backend' and occurred_at>=${start}::timestamp and not (event_name = any(${tx.array([...analyticsEventNames])}::text[])) group by 1 order by events desc`
  result.completeness=await tx`select (select count(*) from analyses where created_at>=${start}::timestamp) as saved_analyses,(select count(*) from scan_reservations where created_at>=${start}::timestamp) as reservations,(select count(*) from users where created_at>=${start}::timestamp) as created_accounts`
 })
 await Bun.write('/private/tmp/mogging-analytics-audit-after-20261010.json',JSON.stringify(result,null,2))
 console.log(JSON.stringify({inventory:result.inventory,billing:result.billing,receipts:result.receipts,completeness:result.completeness,unmapped:result.unmapped}))
} finally {await sql.end();await (globalThis as any).postgresClient?.end()}
