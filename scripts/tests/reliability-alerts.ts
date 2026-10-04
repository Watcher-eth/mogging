// Isolated Bun process: fake email transport and Redis; never contacts production.
import assert from 'node:assert/strict'
import { mock } from 'bun:test'
const claims=new Map<string,string>()
mock.module('@upstash/redis',()=>({Redis:class {
  async set(key:string,value:string) {if(claims.has(key)) return null;claims.set(key,value);return 'OK'}
  async eval(_script:string,keys:string[],args:string[]) {if(claims.get(keys[0])===args[0]) claims.delete(keys[0])}
}}))
mock.module('../../lib/env',()=>({env:{UPSTASH_REDIS_REST_URL:'https://test.invalid',UPSTASH_REDIS_REST_TOKEN:'test-only',RESEND_API_KEY:'test-only',PAYMENTS_EMAIL_FROM:'Mogging <support@mogging.com>'}}))
process.env.RELIABILITY_ALERT_EMAIL='recipient@example.invalid'
const original=globalThis.fetch
let sends=0
let failed=false
let body:Record<string,unknown>={}
globalThis.fetch=(async (url:unknown,options?:RequestInit)=>{
  assert.equal(url,'https://api.resend.com/emails')
  sends++
  body=JSON.parse(String(options?.body))
  return new Response(null,{status:failed?503:200})
}) as typeof fetch
try {
  const {sendReliabilityAlert,reliabilityAlertStatus}=await import('../../lib/reliability/alerts')
  assert.deepEqual(reliabilityAlertStatus(),{configured:true,deduplication:true})
  assert.equal(await sendReliabilityAlert('analyze','provider_unavailable','trace-one'),'sent')
  assert.deepEqual(body.to,['recipient@example.invalid'])
  assert.match(String(body.text),/trace-one/)
  assert.equal(await sendReliabilityAlert('analyze','provider_unavailable','trace-two'),'suppressed')
  assert.equal(sends,1)
  // Separate errors still notify; failed delivery releases only its own cooldown.
  failed=true
  await assert.rejects(sendReliabilityAlert('analyze','provider_auth','trace-three'))
  failed=false
  assert.equal(await sendReliabilityAlert('analyze','provider_auth','trace-four'),'sent')
  assert.equal(sends,3)
  delete process.env.RELIABILITY_ALERT_EMAIL
  assert.equal(await sendReliabilityAlert('analyze','other','trace-five'),'unconfigured')
  assert.equal(sends,3)
  console.log('PASS: recipient, trace, independent error grouping, shared cooldown, failed-send retry, and unconfigured alerts; fake transports only')
} finally { globalThis.fetch=original }
