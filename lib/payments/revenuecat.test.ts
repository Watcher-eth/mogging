import { afterEach, expect, test } from 'bun:test'
import { fetchRevenueCatSubscriber } from './revenuecat'
import { env } from '@/lib/env'
const original = globalThis.fetch
const originalKey = env.REVENUECAT_SECRET_API_KEY
afterEach(() => { globalThis.fetch = original; env.REVENUECAT_SECRET_API_KEY = originalKey })

test('transient provider errors retry verification and concurrent callers share one request', async () => {
  env.REVENUECAT_SECRET_API_KEY = 'test-key'
  let calls = 0
  globalThis.fetch = (async () => {
    calls++
    return calls === 1 ? new Response('', {status:503}) : Response.json({subscriber:{original_app_user_id:'verified'}})
  }) as unknown as typeof fetch
  const results = await Promise.all([fetchRevenueCatSubscriber('same',true),fetchRevenueCatSubscriber('same',true)])
  expect(calls).toBe(2)
  expect(results.map(r=>r?.original_app_user_id)).toEqual(['verified','verified'])
  await fetchRevenueCatSubscriber('same',true)
  expect(calls).toBe(3) // Access is not cached across verification rounds.
})
test('permission failures are not retried and missing accounts do not acquire access', async () => {
  env.REVENUECAT_SECRET_API_KEY = 'test-key'
  let calls = 0
  globalThis.fetch = (async () => { calls++;return new Response('',{status:401}) }) as unknown as typeof fetch
  await expect(fetchRevenueCatSubscriber('denied',true)).rejects.toMatchObject({status:503})
  expect(calls).toBe(1)
  globalThis.fetch = (async () => new Response('',{status:404})) as unknown as typeof fetch
  expect(await fetchRevenueCatSubscriber('missing',true)).toBeNull()
})
test('transport recovery never retries a purchase and repeated failure remains unverified', async () => {
  env.REVENUECAT_SECRET_API_KEY = 'test-key'
  let calls = 0
  globalThis.fetch = (async (_url: RequestInfo | URL, options?: RequestInit) => { calls++;expect(options?.method).toBeUndefined();throw new TypeError('network') }) as unknown as typeof fetch
  expect(await fetchRevenueCatSubscriber('offline')).toBeNull()
  expect(calls).toBe(2)
})
