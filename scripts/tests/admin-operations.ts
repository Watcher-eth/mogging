import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'

const address=process.env.ANALYTICS_TEST_DATABASE_URL
if (!address) throw new Error('Set the disposable localhost analytics_test database')
const url=new URL(address)
if (!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL=address
const connection=postgres(address,{max:1})
try {
  const {operationalQuery}=await import('../../lib/admin/operations')
  const dialect=new PgDialect()
  await connection.begin(async tx=>{
    // Temporary tables shadow test tables on this connection only; the entire run rolls back.
    await tx`create temporary table analytics_identity_links(platform text,account_id text,linked_at timestamp)`
    await tx`create temporary table payment_handoffs(user_id text,created_at timestamp,expires_at timestamp,consumed_at timestamp)`
    await tx`create temporary table referral_links(user_id text)`
    await tx`create temporary table referral_signups(referred_user_id text,inviter_user_id text,created_at timestamp)`
    await tx`create temporary table payment_entitlements(source text,created_at timestamp)`
    await tx`create temporary table push_devices(environment text,timezone text,user_id text,session_expires_at timestamptz)`
    await tx`create temporary table push_deliveries(kind text,user_id text,created_at timestamp)`
    await tx`create temporary table creator_tracking_links(id text,public_url text)`
    await tx`create temporary table creator_attribution_events(tracking_link_id text,first_tracking_link_id text,created_at timestamp,metadata jsonb,event_type text,amount_cents int,currency text,attribution_key text)`
    const now=new Date('2040-01-31T00:00:00Z')
    async function report(section:import('../../lib/admin/operations').OperationalFilters['section']) {
      const q=dialect.sqlToQuery(operationalQuery({section,days:'30'},now))
      const [result]=await tx.unsafe(q.sql,q.params as Parameters<typeof tx.unsafe>[1])
      return result.data as import('../../lib/admin/operations').OperationalData
    }
    assert.deepEqual((await report('Authentication')).rows,[])
    await tx`insert into analytics_identity_links values ('ios','account','2040-01-02'),('web','old','2039-01-01')`
    assert.equal(Number((await report('Authentication')).rows[0].links),1)
    await tx`insert into payment_handoffs values ('a','2040-01-02','2040-02-01',null),('b','2040-01-02','2040-01-03',null),('c','2040-01-02','2040-01-03','2040-01-02')`
    assert.deepEqual((await report('Purchases')).rows.map(row=>row.status).sort(),['Awaiting consumption','Consumed','Expired, unconsumed'])
    await tx`insert into referral_links values ('inviter'),('unused')`
    await tx`insert into referral_signups values ('one','inviter','2040-01-02'),('two','inviter','2040-01-02'),('three','inviter','2040-01-02')`
    await tx`insert into payment_entitlements values ('referral_reward','2040-01-02')`
    const referrals=await report('Referrals')
    assert.equal(Number(referrals.rows.find(row=>row.metric==='Credited signups · period')?.total),3)
    assert.equal(Number(referrals.detail.find(row=>row.progress==='0 credited signups')?.inviters),1)
    await tx`insert into push_devices values ('production','UTC','account','2040-02-01'),('sandbox','UTC','sandbox','2039-01-01')`
    assert.equal(Number((await report('Notifications')).rows.find(row=>row.environment==='production')?.valid_sessions),1)
    await tx`insert into creator_tracking_links values ('last','https://www.mogging.com/r/last'),('first','https://www.mogging.com/r/first')`
    await tx`insert into creator_attribution_events values
      ('last','first','2040-01-02','{}','payment',1000,'USD','buyer'),
      ('last','first','2040-01-03','{}','refund',-200,'USD','buyer'),
      ('last','first','2040-01-04','{}','payment',2000,'EUR','buyer2'),
      ('last','first','2040-01-04','{"environment":"SANDBOX"}','payment',99999,'USD','test')`
    const ledger=await report('AttributionLedger')
    assert.equal(Number(ledger.rows.find(row=>row.credit==='Direct'&&row.currency==='USD')?.net),8)
    assert.equal(Number(ledger.rows.find(row=>row.credit==='Direct'&&row.currency==='EUR')?.net),20)
    assert.equal(Number(ledger.rows.find(row=>row.credit==='First touch'&&row.currency==='USD')?.net),8)
    assert.equal(ledger.detail.reduce((total,row)=>total+Number(row.events),0),3)
  })
  console.log('PASS: identity windows, handoff states, referral credits/progress, notification environments/session validity, attribution currencies, first-touch separation and sandbox exclusion')
} finally { await connection.end() }
