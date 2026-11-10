import {afterAll,expect,test} from 'bun:test'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {and,desc,eq,inArray,isNotNull,lt,sql} from 'drizzle-orm'
import {runStripeRecovery} from './stripe-recovery'
const address=process.env.RELIABILITY_TEST_DATABASE_URL
if(address){const url=new URL(address);if(url.hostname!=='127.0.0.1'||url.port!=='55448')throw Error('Only isolated reliability PostgreSQL is allowed');process.env.DATABASE_URL=address}
const suite=address?test:test.skip
const {db,schema}=await import('@/lib/db')
afterAll(async()=>{if(address)await db.$client.end()})
suite('a single durable lease prevents overlapping cron runs; completed events are skipped during the audit',async()=>{
 await db.execute(sql`delete from billing_reconciliation_state where provider='stripe'`)
 const id=`evt_${crypto.randomUUID()}`
 let calls=0,release:()=>void=()=>{},entered:()=>void=()=>{}
 const started=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve})
 const scope:any={and,desc,eq,inArray,isNotNull,lt,sql,db,schema,runStripeRecovery,Date,crypto,process,
  recordBackendRequest:async()=>{},
  getStripe:()=>({events:{list:async()=>({data:[{id}],has_more:false})},webhookEndpoints:{list:async()=>({data:[{url:'https://www.mogging.com/api/payments/stripe-webhook',status:'enabled',enabled_events:['*']}]})}}),
  processStripeEvent:async()=>{calls++;entered();await gate;await db.insert(schema.billingWebhookReceipts).values({id:`stripe:${id}`,processedAt:new Date()}).onConflictDoNothing()},
 }
 const source=readFileSync(new URL('./stripe-reconciliation.ts',import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace(/^export /gm,'')
 runInNewContext(new Bun.Transpiler({loader:'ts'}).transformSync(source+'\nglobalThis.run=reconcileStripeBilling;'),scope)
 const first=scope.run(new Date());await started
 const second=await scope.run(new Date())
 expect(second).toMatchObject({ran:false,busy:true})
 release();expect(await first).toMatchObject({ran:true,recovered:1,partial:false})
 expect(calls).toBe(1)
 const state=await db.execute(sql`select state,lease_id from billing_reconciliation_state where provider='stripe'`)
 expect(state[0].lease_id).toBeNull()
 expect((state[0].state as any).coveredUntil).toBeGreaterThan(0)
 expect((state[0].state as any).auditedAt).toBeGreaterThan(0)
})
