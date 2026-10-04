import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
const address=process.env.ANALYTICS_TEST_DATABASE_URL
if(!address) throw new Error('Set the disposable localhost analytics_test database')
const url=new URL(address)
if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL=address
const connection=postgres(address,{max:1})
try {
  const {reliabilityQuery}=await import('../../lib/admin/reliability')
  const dialect=new PgDialect()
  await connection.begin(async tx=>{
    await tx`create temporary table analytics_events(event_name text,environment text,platform text,source text,occurred_at timestamp,app_version text,properties jsonb)`
    const now=new Date('2040-01-31T00:00:00Z')
    async function report() {
      const q=dialect.sqlToQuery(reliabilityQuery(7,now))
      const [row]=await tx.unsafe(q.sql,q.params as Parameters<typeof tx.unsafe>[1])
      return row.data as import('../../lib/admin/reliability').ReliabilityData
    }
    assert.equal(Number((await report()).summary.requests),0)
    await tx`insert into analytics_events values
      ('backend_request','production','server','backend','2040-01-30 23:59',null,'{"feature":"analyze","outcome":"failed","code":"provider_unavailable","duration_ms":23000,"trace_id":"failed"}'),
      ('backend_request','production','server','backend','2040-01-30 23:58',null,'{"feature":"analyze","outcome":"failed","code":"input_no_face","duration_ms":1000,"trace_id":"invalid"}'),
      ('backend_request','production','server','backend','2040-01-30 23:57',null,'{"feature":"analyze","outcome":"degraded","code":"analysis_persistence_failed","duration_ms":13000,"trace_id":"degraded"}'),
      ('backend_request','production','server','backend','2040-01-30 23:56',null,'{"feature":"auth","outcome":"rejected","code":"http_401","duration_ms":250,"trace_id":"rejected"}'),
      ('backend_request','preview','server','backend','2040-01-30 23:55',null,'{"feature":"analyze","outcome":"failed","code":"http_500"}'),
      ('backend_request','production','ios','mobile','2040-01-30 23:55',null,'{"feature":"forged","outcome":"failed","code":"http_500"}'),
      ('evaluation_failed','production','ios','mobile','2040-01-30 23:54','1.2','{"reason_code":"network"}'),
      ('backend_evaluation_started','production','server','backend','2040-01-30 23:40',null,'{"trace_id":"stalled"}'),
      ('backend_evaluation_started','production','server','backend','2040-01-30 23:41',null,'{"trace_id":"failed"}'),
      ('backend_evaluation_started','production','server','backend','2040-01-30 23:59',null,'{"trace_id":"inflight"}'),
      ('backend_alert','production','server','backend','2040-01-30 23:59',null,'{"feature":"analyze","code":"provider_unavailable","status":"sent"}')`
    const data=await report()
    assert.equal(Number(data.summary.requests),4)
    assert.equal(Number(data.summary.recent_failures),2)
    assert.equal(Number(data.features.find(row=>row.feature==='analyze')?.technical_failures),1)
    assert.equal(Number(data.features.find(row=>row.feature==='analyze')?.invalid_photos),1)
    assert.equal(data.stalled.length,1)
    assert.equal(data.stalled[0].trace,'stalled')
    assert.equal(data.clients[0].release,'1.2')
    assert.equal(data.notifications[0].status,'sent')
    assert.equal(Number(data.daily[0].evaluation_failures),2)
    // Malformed telemetry cannot break report queries or fabricate latency.
    await tx`insert into analytics_events values('backend_request','production','server','backend','2040-01-30 23:59',null,'{"feature":"malformed","outcome":"ok","duration_ms":"NaN"}')`
    assert.equal((await report()).features.find(row=>row.feature==='malformed')?.p95_ms,null)
  })
  console.log('PASS: reliability environment/source boundaries, technical vs expected failures, unfinished scans, client versions, alert records, malformed durations, and empty data')
} finally { await connection.end() }
