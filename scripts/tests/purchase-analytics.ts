import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { describePurchaseAttempt } from '../../lib/admin/purchase-attempts'

const address = process.env.PURCHASE_ANALYTICS_TEST_DATABASE_URL
if (!address) throw new Error('Set PURCHASE_ANALYTICS_TEST_DATABASE_URL to a disposable localhost purchase_analytics_test database')
const url = new URL(address)
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/purchase_analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL = address
const connection = postgres(address,{max:1})
try {
  const {purchaseAttemptsQuery} = await import('../../lib/admin/purchase-attempt-query')
  await connection.begin(async tx => {
    await tx.unsafe(`CREATE TEMP TABLE analytics_events (
      id text,event_name text,account_id text,mobile_install_id text,anonymous_id text,
      platform text,app_version text,environment text,properties jsonb,occurred_at timestamp,received_at timestamp);
      CREATE TEMP TABLE subscription_events (provider text,environment text,event_name text,transaction_id text,product_id text,occurred_at timestamp);`)
    const now = new Date('2040-01-31T00:00:00Z')
    const base = Date.parse('2040-01-30T00:00:00Z')
    const put = async (attempt:string,event:string,seconds:number,props:Record<string,unknown>={},environment='production',platform='ios',device='device') => {
      await tx`insert into analytics_events values (${crypto.randomUUID()},${event},null,${device},null,${platform},'1.39(73)',${environment},${tx.json({attempt_id:attempt,surface:'onboarding_paywall',purchase_tracking_version:'2',...props})},${new Date(base+seconds*1000)},${new Date(base+seconds*1000)})`
    }
    await put('paid','purchase_started',0)
    await put('paid','purchase_started',0) // A duplicate UX event is still one attempt.
    await put('paid','checkout_started',1,{productId:'monthly'})
    await put('paid','purchase_completed',5,{productId:'monthly',transaction_id:'paid-tx'})
    await put('paid','purchase_activation_failed',6,{reason_code:'credits_not_active'})
    await put('paid','purchase_reconciled',50,{result:'activated',productId:'monthly',transaction_id:'paid-tx'})
    await tx`insert into subscription_events values ('revenuecat','production','subscription_started','paid-tx','monthly',${new Date(base+5000)})`
    await put('cancel','purchase_started',10)
    await put('cancel','checkout_started',11)
    await put('cancel','purchase_cancelled',15,{purchase_stage:'store_purchase',reason_code:'store_cancelled'})
    await put('cancel','purchase_completed',16,{},'production','ios','different-device') // Cannot contaminate another device's attempt.
    await put('pending','purchase_started',20)
    await put('pending','purchase_pending',22,{reason_code:'payment_pending'})
    await put('interrupted','purchase_started',30)
    await put('interrupted','checkout_started',31)
    await put('interrupted','purchase_app_state',32,{app_state:'background'})
    await put('sandbox-ledger','purchase_started',40)
    await put('sandbox-ledger','purchase_completed',45,{transaction_id:'sandbox-tx',productId:'monthly'})
    await tx`insert into subscription_events values ('revenuecat','sandbox','subscription_started','sandbox-tx','monthly',${new Date(base+45000)})`
    await put('sandbox','purchase_started',50,{},'development')
    await put('server','purchase_started',55,{},'production','server')
    await put('old','purchase_started',-32*86400)
    await put('old','purchase_completed',60)
    const dialect=new PgDialect()
    const query=dialect.sqlToQuery(purchaseAttemptsQuery({days:'7',platform:'all'},now))
    const rows = await tx.unsafe(query.sql,query.params as Parameters<typeof tx.unsafe>[1])
    assert.equal(rows.length,5)
    const described=rows.map(row => describePurchaseAttempt({...row,started:new Date(row.started).toISOString()} as any,now.getTime()))
    assert.equal(described.find(a => a.id==='paid')?.outcome,'activated')
    assert.equal(described.find(a => a.id==='paid')?.verified,true)
    assert.equal(described.find(a => a.id==='sandbox-ledger')?.verified,false)
    assert.equal(described.find(a => a.id==='sandbox-ledger')?.sandbox,true)
    assert.equal(described.find(a => a.id==='cancel')?.outcome,'cancelled')
    assert.equal(described.find(a => a.id==='cancel')?.storeDurationMs,4000)
    assert.equal(described.find(a => a.id==='pending')?.outcome,'pending')
    assert.equal(described.find(a => a.id==='interrupted')?.outcome,'unresolved')
    assert.ok(described.every(a => a.events.every(e => e.at.endsWith('Z'))))
    const android=dialect.sqlToQuery(purchaseAttemptsQuery({days:'7',platform:'android'},now))
    assert.equal((await tx.unsafe(android.sql,android.params as Parameters<typeof tx.unsafe>[1])).length,0)
    console.log('Purchase analytics SQL integration passed: attempt deduplication, device isolation, UTC, sandbox exclusion, exact transaction matching, and outcome recovery.')
  })
} finally {await connection.end()}
