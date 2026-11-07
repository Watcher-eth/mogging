import { expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { revenueReportCTEs, APP_STORE_COMMISSION_RATE } from './revenue-report'

const dialect = new PgDialect()
const query = dialect.sqlToQuery(revenueReportCTEs(7, '2026-10-21T00:00:00Z', '2026-10-28T00:00:00Z'))

test('financial reporting keeps unknown costs unknown and refunds signed', () => {
  expect(APP_STORE_COMMISSION_RATE).toBe(0.15)
  expect(query.sql).toContain('amount*tax_rate as taxes')
  expect(query.sql).toContain('count(*) filter(where proceeds is null)=0')
  expect(query.sql).toContain('sum(proceeds) as known_proceeds')
  expect(query.sql).toContain('tax_rate+provider_commission<=1')
  expect(query.params).toContain(0.15)
  expect(query.sql).not.toContain('coalesce(proceeds,0)')
})

test('renewal intent excludes trials, cancellations and billing retry; churn has a starting cohort', () => {
  expect(query.sql).toContain('has_access and not canceled and not trial and not billing_retry')
  expect(query.sql).toContain('initial.snapshot=2')
  expect(query.sql).toContain('active_at_start and (ended or ends_at<=at)')
  expect(query.params).toContain('2026-10-21T00:00:00Z')
  expect(query.params).toContain('2026-10-28T00:00:00Z')
  expect(query.sql).not.toContain('now()')
})

// Disposable local PostgreSQL only: exercise the report SQL rather than matching its text.
const integrationAddress = process.env.REVENUE_REPORT_TEST_DATABASE_URL
if (integrationAddress) {
  const url = new URL(integrationAddress)
  if (url.hostname !== '127.0.0.1' || url.port !== '55448') throw Error('Use disposable local PostgreSQL')
}
test.skipIf(!integrationAddress)('MRR separates renewal intent, currency and missing prices without counting trials or expired access', async () => {
  const { default: postgres } = await import('postgres')
  const client = postgres(integrationAddress!, { max: 1 })
  const fixtures: Array<{ id: string; product: string; amount: number | null; cancelled?: boolean;
    trial?: boolean; ended?: boolean; retry?: boolean; currency?: string; provider?: string; usd?: number }> = [
    { id: 'weekly', product: 'mogging.pro.weekly', amount: 5 },
    { id: 'cancelled', product: 'mogging.pro.weekly', amount: 5, cancelled: true },
    { id: 'yearly', product: 'mogging.pro.yearly', amount: 120 },
    { id: 'trial', product: 'mogging.pro.weekly', amount: 0, trial: true },
    { id: 'expired', product: 'mogging.pro.weekly', amount: 5, ended: true },
    { id: 'retry', product: 'mogging.pro.weekly', amount: 5, retry: true },
    { id: 'foreign', product: 'mogging.pro.monthly', amount: 10, currency: 'EUR', usd: 11 },
    { id: 'stripe', product: 'mobile_subscription_monthly', amount: 10, provider: 'stripe' },
  ]
  const run = async (input: typeof fixtures) => {
    const compiled = dialect.sqlToQuery(sql`with fixtures as (
      select * from jsonb_to_recordset(${JSON.stringify(input)}::text::jsonb)
        as x(id text,product text,amount numeric,cancelled boolean,trial boolean,ended boolean,retry boolean,currency text,provider text,usd numeric)
    ), subscription_facts as (
      select id,coalesce(provider,'revenuecat') as provider,id as subscription_id,product as product_id,
        amount,coalesce(currency,'USD') as currency,jsonb_build_object('store','APP_STORE','usd_amount',usd) as properties,
        case when trial then 'trial_started' else 'subscription_started' end as event_name,
        '2026-10-20'::timestamp as occurred_at,'2026-10-20'::timestamp as received_at from fixtures
      union all
      select id || '-retry',coalesce(provider,'revenuecat'),id,product,0,coalesce(currency,'USD'),jsonb_build_object('store','APP_STORE'),
        'billing_issue_started','2026-10-21'::timestamp,'2026-10-21'::timestamp from fixtures where retry
    ), b as (select * from subscription_facts), revenue_reporting_history as (select * from b), revenue_reporting_period as (select * from b), subscription_snapshots as (
      select 0 as snapshot,'2026-10-31'::timestamp as at,coalesce(provider,'revenuecat') as provider,id as subscription_id,
        case when ended then '2026-10-25'::timestamp else '2026-11-20'::timestamp end as ends_at,
        coalesce(cancelled,false) as canceled,coalesce(ended,false) as ended from fixtures
    ), ${revenueReportCTEs(30,'2026-10-01T00:00:00Z','2026-10-31T00:00:00Z')}
    select * from revenue_subscription_mrr`)
    return client.unsafe(compiled.sql, compiled.params as Parameters<typeof client.unsafe>[1])
  }
  try {
    const rows = await run(fixtures)
    const usd = rows.find(r => r.source === 'Apple App Store' && r.currency === 'USD')!
    expect(Number(usd.renewing_subscriptions)).toBe(2)
    expect(Number(usd.renewing_mrr)).toBe(30)
    expect(Number(usd.cancelling_mrr)).toBe(20)
    expect(Number(usd.active_access_mrr)).toBe(70)
    expect(Number(usd.billing_retry_subscriptions)).toBe(1)
    expect(Number(rows.find(r => r.currency === 'EUR')!.renewing_mrr)).toBe(10)
    expect(Number(rows.find(r => r.currency === 'EUR')!.active_mrr_usd)).toBe(11)
    expect(Number(rows.find(r => r.source === 'Stripe')!.renewing_mrr)).toBe(10)
    const incomplete = await run([...fixtures,{id:'unknown',product:'mogging.pro.monthly',amount:null}])
    const missing = incomplete.find(r => r.source === 'Apple App Store' && r.currency === 'USD')!
    expect(missing.renewing_mrr).toBeNull()
    expect(Number(missing.known_renewing_mrr)).toBe(30)
    expect(Number(missing.missing_price_subscriptions)).toBe(1)
  } finally { await client.end() }
})
