import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { WEB_FLOW_VERSION, webFlowContext } from './web-context'
import { rememberStripeAttempt, readStripeAttempt, clearStripeAttempt } from '@/lib/client/stripe-attempt'

function journey(storage: Map<string, string>, blocked = false) {
  const scope: any = { WEB_FLOW_VERSION, webFlowContext, crypto, Date, URLSearchParams, window: {}, location: { pathname: '/analysis', search: '?start=1&email=private' }, sessionStorage: {
    getItem: (key: string) => { if (blocked) throw Error(); return storage.get(key) ?? null },
    setItem: (key: string, value: string) => { if (blocked) throw Error(); storage.set(key, value) },
    removeItem: (key: string) => storage.delete(key),
  } }
  const source = readFileSync(new URL('./web-journey.ts', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace(/export /g, '')
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source) + '\nglobalThis.api={webJourneyContext,restoreWebJourney,resetWebJourney}', scope)
  return scope.api
}

test('journey survives reload and payment restoration, resets for account changes, and excludes URL data', () => {
  const storage = new Map<string,string>()
  const first = journey(storage).webJourneyContext()
  expect(first.entry_mode).toBe('photo_first')
  const reload = journey(storage)
  expect(reload.webJourneyContext().flow_id).toBe(first.flow_id)
  const restored = crypto.randomUUID()
  reload.restoreWebJourney(restored)
  expect(journey(storage).webJourneyContext().flow_id).toBe(restored)
  reload.resetWebJourney()
  expect(reload.webJourneyContext().flow_id).not.toBe(restored)
  expect(JSON.stringify([...storage.values()])).not.toContain('private')
  expect(journey(new Map(), true).webJourneyContext().flow_id).toBeString()
})

test('unfinished Stripe confirmation retains correlation across retries and mismatched sessions', () => {
  const original = globalThis.sessionStorage
  const storage = new Map<string,string>()
  globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => { storage.set(key, value) }, removeItem: key => { storage.delete(key) } } as Storage
  try {
    const attempt = { sessionId: 'cs_fixture', attempt_id: crypto.randomUUID(), product: 'evaluation', flow_id: crypto.randomUUID() }
    rememberStripeAttempt('web_analysis', attempt)
    expect(readStripeAttempt('web_analysis', 'cs_other')).toBeNull()
    expect(readStripeAttempt('web_analysis', 'cs_fixture')).toEqual(attempt)
    expect(readStripeAttempt('web_analysis', 'cs_fixture')).toEqual(attempt)
    clearStripeAttempt('web_analysis')
    expect(readStripeAttempt('web_analysis')).toBeNull()
  } finally { globalThis.sessionStorage = original }
})
