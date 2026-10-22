import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { z } from 'zod'

class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const compile = (source: string, scope: Record<string, unknown>) => runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source), scope)
function route(file: string, overrides: Record<string, unknown> = {}) {
  const calls: any[] = []
  const scope: any = {
    z, ApiError, env: { STRIPE_SECRET_KEY: 'fixture' },
    parseBody: (schema: any, body: unknown) => schema.parse(body),
    json: (_res: unknown, status: number, data: unknown) => ({ status, data }),
    methodNotAllowed: () => ({ status: 405 }),
    handleApiError: (error: any) => ({ status: error.status || 400, error: error.message }),
    getRequestUserId: async () => 'buyer',
    getEntitlementSummary: async () => ({ evaluationCredits: 0 }),
    confirmCheckoutForAccount: async () => ({ mobileInstallId: 'fixture-install', source: 'web_analysis' }),
    createPaymentHandoff: async () => ({ token: 'mobile-token' }),
    getProductConfig: () => ({ mode: 'payment' }), getCheckoutLineItem: () => ({}),
    resolveCreatorAttribution: async () => null, getAccountCreatorAttribution: async () => null, stripeAttributionMetadata: () => ({}),
    parseLandingAssignment: () => null, landingProperties: () => ({}), LANDING_COOKIE: 'landing',
    recordCreatorCheckout: async () => {}, recordServerEvent: async () => {},
    getStripe: () => ({ checkout: { sessions: { create: async (input: any) => { calls.push(input); return { id: 'cs_live_fixture', url: 'https://checkout.stripe.com/fixture' } } } } }),
    ...overrides,
  }
  const source = readFileSync(new URL(`../../pages/api/payments/${file}.ts`, import.meta.url), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/^export default .*$/gm, '')
  compile(source + '\nglobalThis.handler=handler', scope)
  return { calls, run: (body = { sessionId: 'cs_live_fixture' }) => scope.handler({ method: 'POST', body, headers: { host: 'www.mogging.com', 'x-forwarded-proto': 'https' }, cookies: {} }, {}) }
}

test('website checkout returns to analysis, not mobile handoff', async () => {
  const f = route('checkout'); await f.run({ imageCount: 1, mobileInstallId: 'fixture-install' } as any)
  expect(f.calls[0].success_url).toBe('https://www.mogging.com/analysis?checkout=success&session_id={CHECKOUT_SESSION_ID}')
})
test('existing credits bypass Stripe checkout entirely', async () => {
  const f = route('checkout', { getEntitlementSummary: async () => ({ evaluationCredits: 1 }) })
  expect(await f.run({ imageCount: 1, mobileInstallId: 'fixture-install' } as any)).toEqual({ status: 200, data: { url: '/analysis?resume=1' } })
  expect(f.calls).toHaveLength(0)
})
test('confirmation requires the signed-in buyer and preserves ownership rejection', async () => {
  const f = route('confirm', { getRequestUserId: async () => null, confirmCheckoutForAccount: () => { throw new Error('must not confirm') } })
  expect((await f.run()).status).toBe(401)
  const other = route('confirm', { confirmCheckoutForAccount: async () => { throw new ApiError(403, 'Wrong buyer') } })
  expect((await other.run()).status).toBe(403)
})
test('confirmation does not allow an unpaid checkout to resume', async () => {
  const f = route('confirm', { confirmCheckoutForAccount: async () => { throw new ApiError(409, 'Payment confirmation is still processing') } })
  expect((await f.run()).status).toBe(409)
})
test('old web checkout links recover into analysis, mobile purchases retain app handoff', async () => {
  const f = route('handoff/create')
  expect((await f.run()).data.analysisUrl).toBe('/analysis?checkout=success&session_id=cs_live_fixture')
  const mobile = route('handoff/create', { confirmCheckoutForAccount: async () => ({ source: 'web_pricing' }) })
  expect((await mobile.run()).data.token).toBe('mobile-token')
})

test('paid return restores the saved photo and gender, confirms ownership and runs one shared scan path', async () => {
  const source = readFileSync(new URL('../../pages/analysis.tsx', import.meta.url), 'utf8')
  const start = source.indexOf('  const resumeAfterPayment = ')
  const end = source.indexOf('\n  useEffect(', start)
  const calls: any[] = [], steps: string[] = []
  const draft = { gender: 'male', images: [{ id: 'photo', dataUrl: 'fixture-photo' }] }
  const scope: any = { useCallback: (fn: unknown) => fn, encodeURIComponent,
    router: { replace: async () => {} }, setError() {}, setAnalysisUnlocked() {}, setPaymentDialogOpen() {}, setProgress() {}, setImages() {}, setSelectedImageId() {}, setGender() {},
    setStep: (step: string) => steps.push(step),
    apiPost: async (path: string, body: unknown) => { calls.push([path, body]); return { entitlements: { mobileInstallId: 'paid-install', evaluationCredits: 1 } } },
    loadAnalysisDraft: async () => draft, ensureAnalysisWebInstallId: (id: string) => id,
    runActualAnalysis: async (...args: unknown[]) => calls.push(args),
  }
  compile(source.slice(start, end) + '\nglobalThis.resume=resumeAfterPayment', scope)
  await scope.resume('cs_live_fixture')
  expect(calls).toEqual([['/api/payments/confirm', { sessionId: 'cs_live_fixture' }], [draft.images, 'paid-install', 'male']])
  scope.loadAnalysisDraft = async () => null
  await scope.resume('cs_live_fixture')
  expect(steps.at(-1)).toBe('upload')
  expect(calls.filter(call => call[0] === draft.images)).toHaveLength(1)
})

test('real confirmation checks Stripe ownership/payment and never grants a paid credit twice', async () => {
  const source = readFileSync(new URL('./entitlements.ts', import.meta.url), 'utf8')
  const start = source.indexOf('export async function confirmCheckoutForAccount')
  const end = source.indexOf('\nexport async function grantEntitlementFromCheckoutSession', start)
  let existing: unknown = null, grants = 0
  const session = { metadata: { accountId: 'buyer' }, client_reference_id: 'buyer', status: 'complete', payment_status: 'paid' }
  const scope: any = { ApiError, eq: () => true, and: () => true,
    schema: { paymentEntitlements: {}, subscriptionEvents: {} }, db: { query: { paymentEntitlements: { findFirst: async () => existing }, subscriptionEvents: { findFirst: async () => existing ? { id: 'ledger' } : null } } },
    recordVerifiedStripeCheckout: async () => {}, recordBackendRequest: async () => {},
    getStripe: () => ({ checkout: { sessions: { retrieve: async () => session } } }),
    grantEntitlementFromCheckoutSession: async () => { grants++; existing = { userId: 'buyer', creditBalance: 1 } },
  }
  compile(source.slice(start, end).replace('export ', '') + '\nglobalThis.confirm=confirmCheckoutForAccount', scope)
  await expect(scope.confirm('cs_live_fixture', 'other-buyer')).rejects.toMatchObject({ status: 403 })
  session.payment_status = 'unpaid'
  await expect(scope.confirm('cs_live_fixture', 'buyer')).rejects.toMatchObject({ status: 409 })
  expect(grants).toBe(0)
  session.payment_status = 'paid'
  expect(await scope.confirm('cs_live_fixture', 'buyer')).toEqual({ userId: 'buyer', creditBalance: 1 })
  await scope.confirm('cs_live_fixture', 'buyer')
  expect(grants).toBe(1)
})
