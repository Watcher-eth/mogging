import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ApiClientError } from '@/lib/api/client'

function checkout(overrides: Record<string, unknown> = {}) {
  const source = readFileSync(new URL('../../pages/analysis.tsx', import.meta.url), 'utf8')
  const calls: string[] = [], events: any[] = [], errors: string[] = []
  const context: any = {
    walkthrough: false, status: 'authenticated', checkoutLoading: false, images: [{}, { view: 'side' }], gender: 'male', mobileScan: false, Date, Error, ApiClientError,
    preferences: { focus: 'eyes' }, privacyAccepted: true,
    useCallback: (fn: Function) => fn, runActualAnalysis() {},
    crypto, webJourneyContext: () => ({ flow_version: "test", entry_mode: "photo_first" }), flushWebAnalytics() {},
    setLoginOpen() {}, setCheckoutStatus() {}, setError: (error: string | null) => { if (error) errors.push(error) },
    ensureAnalysisWebInstallId: () => 'checkout-test',
    apiGet: async () => { calls.push('entitlements'); return { entitlements: { evaluationCredits: 0, subscription: { active: false } } } },
    saveAnalysisDraft: async (draft: { preferences: { focus: string }; desktopConsent: boolean }) => { expect(draft.preferences.focus).toBe('eyes'); expect(draft.desktopConsent).toBe(true); calls.push('draft') },
    apiPost: async (_url: string, body: { imageCount: number }) => { expect(body.imageCount).toBe(1); calls.push('checkout'); return { url: 'https://checkout.stripe.com/test', sessionId: 'cs_test_fixture' } },
    saveCheckoutAnalysisDraft: async (_session: string, draft: { requestIds: string[] }) => { expect(draft.requestIds).toHaveLength(1); calls.push('checkout draft') },
    rememberStripeAttempt() {},
    window: { location: { set href(_value: string) { calls.push('redirect') } } },
    trackWebEvent: (event: string, properties: unknown) => events.push({ event, properties }),
    ...overrides,
  }
  const start = source.indexOf('  const startCheckout = useCallback(')
  const end = source.indexOf('  const resumeAfterPayment = useCallback', start)
  runInNewContext(new Bun.Transpiler({ loader: 'tsx' }).transformSync(source.slice(start, end) + '\nglobalThis.checkout = startCheckout'), context)
  return { run: () => context.checkout('evaluation', {}), calls, events, errors }
}

test('web checkout persists the draft before creating or opening payment', async () => {
  const h = checkout()
  await h.run()
  expect(h.calls).toEqual(['entitlements', 'draft', 'checkout', 'checkout draft', 'redirect'])
  expect(h.events.at(-1)).toMatchObject({ event: 'purchase_stage_changed', properties: { purchase_stage: 'checkout_redirect' } })
})

test('unavailable photo storage never creates checkout and identifies its stage', async () => {
  const h = checkout({ saveAnalysisDraft: async () => { throw new Error('Private storage detail') } })
  await h.run()
  expect(h.calls).toEqual(['entitlements'])
  expect(h.events[0].event).toBe('purchase_started')
  expect(h.events.find(event => event.event === 'purchase_failed')?.properties).toMatchObject({ purchase_stage: 'draft_save', reason_code: 'draft_storage_unavailable' })
  expect(JSON.stringify(h.events)).not.toContain('Private storage detail')
  expect(h.errors[0]).toContain('You have not been charged')
})

test('checkout network failure is distinguished from entitlement and draft failures', async () => {
  const h = checkout({ apiPost: async () => { throw new TypeError('Network unavailable') } })
  await h.run()
  expect(h.events.find(event => event.event === 'purchase_failed')?.properties).toMatchObject({ purchase_stage: 'checkout_create', reason_code: 'request_failed' })
  expect(h.calls).not.toContain('redirect')
})

test('expired entitlement sessions preserve the safe HTTP status without opening checkout', async () => {
  const h = checkout({ apiGet: async () => { throw new ApiClientError(401, 'unauthorized', 'Sign in again') } })
  await h.run()
  expect(h.events.find(event => event.event === 'purchase_failed')?.properties).toMatchObject({ purchase_stage: 'entitlements', reason_code: 'unauthorized', http_status: 401 })
  expect(h.calls).toEqual([])
})
