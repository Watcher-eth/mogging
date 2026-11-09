import { stripeJourneyProperties, webRequestContext } from '@/lib/analytics/web-context'
import { getWebAnalysisPrice, getWebStarterIntro, isWebAnalysisProduct, WEB_ANALYSIS_CREATOR_COUPON, webAnalysisCheckoutLimit, webAnalysisProductForLookupKey, webAnalysisProducts, webStarterIntro } from './web-analysis-plans'
import { issueStarterIntro, readStarterIntro, requireActiveStarterIntro, starterIntroCookie } from './web-starter-intro'
import { createHash } from 'node:crypto'
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { z } from 'zod'

class ApiError extends Error { constructor(public status: number, message: string) { super(message) } }
const introSecret = 'fixture-starter-intro'
const compile = (source: string, scope: Record<string, unknown>) => runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source), scope)
function route(file: string, overrides: Record<string, unknown> = {}) {
  const calls: any[] = []
  const headers: Record<string, unknown> = {}
  const scope: any = {
    z, ApiError, stripeJourneyProperties, webRequestContext, createHash, env: { STRIPE_SECRET_KEY: 'fixture', NEXTAUTH_SECRET: introSecret },
    parseBody: (schema: any, body: unknown) => schema.parse(body),
    json: (_res: unknown, status: number, data: unknown) => ({ status, data }),
    methodNotAllowed: () => ({ status: 405 }),
    handleApiError: (error: any) => ({ status: error.status || 400, error: error.message }),
    getRequestUserId: async () => 'buyer',
    getEntitlementSummary: async () => ({ evaluationCredits: 0, subscription: { active: false } }),
    isWebAnalysisProduct, WEB_ANALYSIS_CREATOR_COUPON, webAnalysisCheckoutLimit, webStarterIntro, verifyWebCheckoutGuest: async () => false,
    issueStarterIntro, readStarterIntro, requireActiveStarterIntro, starterIntroCookie, enforceRateLimit: async () => {},
    confirmCheckoutForAccount: async () => ({ mobileInstallId: 'fixture-install', source: 'web_analysis' }),
    createPaymentHandoff: async () => ({ token: 'mobile-token' }),
    getProductConfig: (id: string) => ({ mode: isWebAnalysisProduct(id) || id.startsWith('mobile_subscription_') ? 'subscription' : 'payment', unitAmount: 499 }),
    validateCheckoutProduct: async () => ({ unit_amount: 499, currency: 'usd' }),
    readLandingCookie: () => null, serializeLandingAssignment: () => '',
    paymentProductSchemaValues: ['evaluation','evaluation_pack_3','mobile_subscription_weekly','mobile_subscription_monthly','mobile_subscription_yearly','extra_potential_image', ...webAnalysisProducts],
    subscriptionProducts: ['mobile_subscription_weekly', 'mobile_subscription_monthly', 'mobile_subscription_yearly'],
    CREATOR_MONTHLY_COUPON: 'first-month',
    locales: ['en','de','es','fr','zh'], generatePaymentActivationCode: () => 'fixture-code',
    getStoredMobileCreatorAttribution: async () => null, getCreatorStripeCustomer: async () => 'cus_fixture',
    db: { transaction: async (fn: any) => fn({ execute: async () => {} }) }, sql: () => '', getCheckoutLineItem: () => ({}),
    resolveCreatorAttribution: async () => null, resolveCheckoutCreator: async () => null, getWebCreatorCoupon: async () => null, getAccountCreatorAttribution: async () => null, stripeAttributionMetadata: () => ({}),
    parseLandingAssignment: () => null, landingProperties: () => ({}), LANDING_COOKIE: 'landing',
    recordCreatorCheckout: async () => {}, recordServerEvent: async () => {},
    getStripe: () => ({ checkout: { sessions: { create: async (input: any) => { calls.push(input); return { id: 'cs_live_fixture', url: 'https://checkout.stripe.com/fixture' } } } } }),
    ...overrides,
  }
  const source = readFileSync(new URL(`../../pages/api/payments/${file}.ts`, import.meta.url), 'utf8')
    .replace(/^import .*\n/gm, '').replace(/^export default .*$/gm, '')
  compile(source + '\nglobalThis.handler=handler', scope)
  return { calls, headers, run: (body = { sessionId: 'cs_live_fixture' }, cookies: Record<string, string> = {}) =>
    scope.handler({ method: 'POST', body, headers: { host: 'www.mogging.com', 'x-forwarded-proto': 'https' }, cookies },
      { setHeader: (name: string, value: unknown) => { headers[name] = value } }) }
}

test('website checkout returns to analysis, not mobile handoff', async () => {
  const f = route('checkout'); await f.run({ imageCount: 1, mobileInstallId: 'fixture-install' } as any)
  expect(f.calls[0].success_url).toBe('https://www.mogging.com/analysis?checkout=success&session_id={CHECKOUT_SESSION_ID}')
})
test('existing credits bypass Stripe checkout entirely', async () => {
  const f = route('checkout', { getEntitlementSummary: async () => ({ evaluationCredits: 1 }) })
  expect(await f.run({ imageCount: 1, mobileInstallId: 'fixture-install' } as any)).toEqual({ status: 200, data: { url: '/analysis?start=1&resumePhoto=1' } })
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
  const preferences = { focus: 'eyes' }
  const draft = { gender: 'male', images: [{ id: 'photo', dataUrl: 'fixture-photo' }], preferences, desktopConsent: true, requestIds: ['saved-scan-id'] }
  const restored: unknown[] = []
  const restoredConsent: boolean[] = []
  const scope: any = { useCallback: (fn: unknown) => fn, guestReturn: false, session: null, mutate() {},
    readStripeAttempt: () => null, clearStripeAttempt() {}, restoreWebJourney() {}, stripeAttemptProperties: () => ({}),
    trackWebEvent() {}, activatedCheckout: { current: null }, loadedAnalysisIdRef: { current: null },
    router: { replace: async (target: unknown) => { calls.push(['navigate', target]) } }, setLoginOpen() {}, setAutoPaywall() {}, setError() {}, setAnalysisUnlocked() {}, setPaymentDialogOpen() {}, setProgress() {}, setImages() {}, setSelectedImageId() {}, setGender() {},
    setPreferences: (value: unknown) => restored.push(value), setPrivacyAccepted: (value: boolean) => restoredConsent.push(value), setCaptureStep() {},
    setStep: (step: string) => steps.push(step),
    apiPost: async (path: string, body: unknown) => { calls.push([path, body]); return { entitlements: { mobileInstallId: 'paid-install', evaluationCredits: 0 } } },
    loadCheckoutAnalysisDraft: async () => draft, loadAnalysisDraft: async () => null, ensureAnalysisWebInstallId: (id: string) => id,
    runActualAnalysis: async (...args: unknown[]) => { calls.push(args); return 'report-id' },
    clearCheckoutAnalysisDraft: async () => {},
  }
  compile(source.slice(start, end) + '\nglobalThis.resume=resumeAfterPayment', scope)
  await scope.resume('cs_live_fixture')
  expect(calls).toEqual([['/api/payments/confirm', { sessionId: 'cs_live_fixture' }], [draft.images, 'paid-install', 'male', ['saved-scan-id']], ['navigate', { pathname: '/analysis', query: { analysisId: 'report-id' } }]])
  expect(restored).toEqual([preferences])
  expect(restoredConsent).toEqual([true])
  scope.loadCheckoutAnalysisDraft = async () => null
  await scope.resume('cs_live_fixture')
  expect(steps.at(-1)).toBe('upload')
  expect(calls.filter(call => call[0] === draft.images)).toHaveLength(1)
})

test('web checkout rejects the retired potential image add-on before contacting Stripe', async () => {
  const fixture = route('web-checkout', { getStripe: () => { throw new Error('must not contact Stripe') } })
  const result = await fixture.run({ product: 'extra_potential_image', mobileInstallId: 'fixture-install' } as any)
  expect(result.status).toBe(400)
  expect(fixture.calls).toHaveLength(0)
})

test('guest web checkout uses the web Stripe prices and applies the creator discount across web plans', async () => {
  const inputs: any[] = []
  const price = { id: 'price_fixture', unit_amount: 2999, currency: 'usd', product: 'mogging_web_pro_v1' }
  const basic = { id: 'price_basic_v2', unit_amount: 899, currency: 'usd', product: 'mogging_web_basic_v1' }
  let couponAvailable = true
  const f = route('web-checkout', {
    getRequestUserId: async () => null,
    validateCheckoutProduct: async (product: string) => product === 'web_basic_weekly' ? basic : price,
    priceAmounts: (quoted: typeof basic) => ({ usd: quoted.unit_amount }),
    createWebCheckoutGuest: async () => ({ accountId: 'guest', recoveryKey: 'fixture' }),
    rememberWebCheckoutGuest: () => {},
    resolveCheckoutCreator: async () => ({ clickId: 'creator-click' }),
    getWebCreatorCoupon: async () => couponAvailable ? { valid: true, duration: 'once', percent_off: 10, applies_to: { products: [price.product, basic.product] } } : null,
    getStripe: () => ({
      checkout: { sessions: { create: async (input: unknown) => { inputs.push(input); return { id: 'cs_test_fixture', url: 'https://checkout.stripe.com/fixture' } } } },
    }),
  })
  const body = { mobileInstallId: 'fixture-install', source: 'web_analysis', returnTo: 'analysis', guestCheckout: true }
  expect((await f.run({ ...body, product: 'web_pro_monthly' } as any)).status).toBe(200)
  expect(inputs[0].line_items).toEqual([{ price: price.id, quantity: 1 }])
  expect(inputs[0].discounts).toEqual([{ coupon: WEB_ANALYSIS_CREATOR_COUPON }])
  expect(inputs[0].success_url).toContain('guest=1')
  const weekly = { ...body, product: 'web_basic_weekly', currency: 'usd', unitAmount: 899 }
  expect((await f.run({ ...weekly, unitAmount: 999 } as any)).status).toBe(409)
  expect((await f.run({ ...weekly, imageCount: 2 } as any)).status).toBe(400)
  expect((await f.run({ ...weekly, creatorDiscount: true } as any)).status).toBe(200)
  expect(inputs[1].line_items).toEqual([{ price: basic.id, quantity: 1 }])
  expect(inputs[1].discounts).toEqual([{ coupon: WEB_ANALYSIS_CREATOR_COUPON }])
  couponAvailable = false
  expect((await f.run(weekly as any)).status).toBe(503)
  expect(inputs).toHaveLength(2)
  expect((await f.run({ ...body, product: 'web_pro_monthly', source: 'mobile' } as any)).status).toBe(400)
})

test('mobile web checkout selects its matching Stripe price and rejects a desktop quote', async () => {
  const f = route('web-checkout', {
    validateCheckoutProduct: async (product: typeof webAnalysisProducts[number], _config: unknown, mobile: boolean) => {
      const plan = getWebAnalysisPrice(product, mobile)
      return { id: plan.lookupKey, unit_amount: plan.unitAmount, currency: 'usd' }
    },
    priceAmounts: (price: { unit_amount: number }) => ({ usd: price.unit_amount }),
  })
  const base = { mobileInstallId: 'fixture-install', source: 'web_analysis', returnTo: 'analysis', currency: 'usd' }
  const mobile = { ...base, webPriceVariant: 'mobile' }
  for (const [product, unitAmount] of [['web_basic_weekly', 699], ['web_basic_monthly', 1499], ['web_pro_monthly', 1999]] as const) {
    expect((await f.run({ ...mobile, product, unitAmount } as any)).status).toBe(200)
    const key = f.calls.at(-1).line_items[0].price
    expect(key).toStartWith('mogging_mobile_web_')
    expect(webAnalysisProductForLookupKey(key)).toBe(product)
    expect((await f.run({ ...base, product, unitAmount } as any)).status).toBe(409)
  }
  expect(f.calls).toHaveLength(3)
})

test('Starter intro applies one coupon to the existing monthly price, including for guests', async () => {
  const price = (mobile: boolean) => {
    const plan = getWebAnalysisPrice(webStarterIntro.product, mobile)
    return { id: plan.lookupKey, unit_amount: plan.unitAmount, currency: 'usd' }
  }
  const fixture = route('web-checkout', {
    getRequestUserId: async () => null,
    createWebCheckoutGuest: async () => ({ accountId: 'guest', recoveryKey: 'fixture' }),
    rememberWebCheckoutGuest: () => {},
    validateCheckoutProduct: async (_product: string, _config: unknown, mobile: boolean) => price(mobile),
    getWebStarterIntroCoupon: async (quotedPrice: { id: string }, mobile: boolean) => quotedPrice.id === price(mobile).id ? getWebStarterIntro(mobile).coupon : null,
    priceAmounts: (quotedPrice: { unit_amount: number }) => ({ usd: quotedPrice.unit_amount }),
  })
  const flowId = crypto.randomUUID()
  const issued = issueStarterIntro(flowId, introSecret)
  const cookies = { [starterIntroCookie(flowId)]: issued.value }
  const request = { flowId, source: 'web_analysis', returnTo: 'analysis', mobileInstallId: 'fixture-install', guestCheckout: true, starterIntro: true, currency: 'usd', unitAmount: 1799 }
  expect((await fixture.run({ ...request, product: 'web_basic_weekly' } as any)).status).toBe(400)
  expect((await fixture.run({ ...request, product: 'web_pro_monthly' } as any)).status).toBe(400)
  expect((await fixture.run({ ...request, product: webStarterIntro.product, unitAmount: 999 } as any, cookies)).status).toBe(409)
  expect((await fixture.run({ ...request, product: webStarterIntro.product } as any, cookies)).status).toBe(200)
  expect(fixture.calls).toHaveLength(1)
  expect(fixture.calls[0]).toMatchObject({
    line_items: [{ price: price(false).id, quantity: 1 }],
    discounts: [{ coupon: webStarterIntro.coupon }],
    subscription_data: { metadata: { starterIntro: webStarterIntro.coupon } },
  })
  expect((await fixture.run({ ...request, product: webStarterIntro.product, webPriceVariant: 'mobile', unitAmount: 1499 } as any, cookies)).status).toBe(200)
  expect(fixture.calls[1]).toMatchObject({
    line_items: [{ price: price(true).id, quantity: 1 }],
    discounts: [{ coupon: getWebStarterIntro(true).coupon }],
  })
  const unavailable = route('web-checkout', { getWebStarterIntroCoupon: async () => null })
  expect((await unavailable.run({ ...request, product: webStarterIntro.product } as any, cookies)).status).toBe(503)
  expect(unavailable.calls).toHaveLength(0)
})

test('Starter intro keeps one five-minute deadline and checkout rejects an expired or altered cookie', async () => {
  const offer = route('starter-intro')
  const checkout = route('web-checkout')
  const flowId = crypto.randomUUID()
  const opened = await offer.run({ flowId } as any)
  expect(opened.status).toBe(200)
  expect(opened.data.deadline - opened.data.serverNow).toBeGreaterThan(webStarterIntro.durationMs - 1000)
  const name = starterIntroCookie(flowId)
  const cookie = String(offer.headers['Set-Cookie']).split(';')[0].slice(name.length + 1)
  expect((await offer.run({ flowId } as any, { [name]: cookie })).data.deadline).toBe(opened.data.deadline)

  const expired = issueStarterIntro(flowId, introSecret, Date.now() - webStarterIntro.durationMs)
  expect((await offer.run({ flowId } as any, { [name]: expired.value })).data.deadline).toBe(expired.deadline)
  const request = { flowId, product: webStarterIntro.product, source: 'web_analysis', returnTo: 'analysis', mobileInstallId: 'fixture-install', starterIntro: true }
  for (const value of [expired.value, cookie.replace(/^\d+/, String(opened.data.deadline + 1)), issueStarterIntro(crypto.randomUUID(), introSecret).value]) {
    const response = await checkout.run(request as any, { [name]: value })
    expect(response.error).toBe('This first-month offer has expired.')
  }
  expect(checkout.calls).toHaveLength(0)
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


test('the report quote must still match at checkout; stale prices do not create a session', async () => {
  const f = route('checkout')
  expect((await f.run({ imageCount: 1, mobileInstallId: 'fixture-install', unitAmount: 999, currency: 'usd' } as any)).status).toBe(409)
  expect(f.calls).toHaveLength(0)
  await f.run({ imageCount: 1, mobileInstallId: 'fixture-install', unitAmount: 499, currency: 'usd' } as any)
  expect(f.calls[0].currency).toBe('usd')
  expect(f.calls[0].adaptive_pricing.enabled).toBe(false)
})

test('Pro checkout resumes a saved web analysis while homepage subscriptions retain mobile handoff', async () => {
  const body = { product: 'mobile_subscription_monthly', mobileInstallId: 'fixture-install', source: 'web_analysis', unitAmount: 499, currency: 'usd' }
  const web = route('web-checkout', { priceAmounts: () => ({ usd: 499 }) })
  expect((await web.run({ ...body, returnTo: 'analysis' } as any)).status).toBe(200)
  expect(web.calls[0].mode).toBe('subscription')
  expect(web.calls[0].success_url).toBe('https://www.mogging.com/analysis?checkout=success&session_id={CHECKOUT_SESSION_ID}')
  expect(web.calls[0].cancel_url).toBe('https://www.mogging.com/analysis?checkout=cancelled')
  expect(web.calls[0].subscription_data.metadata.accountId).toBe('buyer')
  const mobile = route('web-checkout', { priceAmounts: () => ({ usd: 499 }) })
  await mobile.run(body as any)
  expect(mobile.calls[0].success_url).toBe('https://www.mogging.com/app/handoff?session_id={CHECKOUT_SESSION_ID}')
})


test('return offer only applies to monthly analysis checkout and replaces the previous session', async () => {
  const previous = 'cs_live_previous'
  const expired: string[] = []
  const validated: string[] = []
  const created: any[] = []
  const routeFixture = route('web-checkout', {
    CREATOR_MONTHLY_COUPON: 'first-month',
    validateWebReturnOffer: async (accountId: string, sessionId: string) => {
      expect(accountId).toBe('buyer')
      validated.push(sessionId)
      return { id: sessionId }
    },
    getStripe: () => ({ checkout: { sessions: {
      create: async (options: unknown) => { created.push(options); return { id: 'cs_live_replacement', url: 'https://checkout.stripe.com/fixture' } },
      expire: async (id: string) => { expired.push(id) },
    } } }),
  })
  const body = { product: 'mobile_subscription_monthly', mobileInstallId: 'fixture-install', returnTo: 'analysis', returnOfferSessionId: previous }
  expect((await routeFixture.run({ ...body, product: 'evaluation' } as any)).status).toBe(400)
  expect((await routeFixture.run(body as any)).status).toBe(200)
  expect(validated).toEqual([previous])
  expect(created[0].discounts).toEqual([{ coupon: 'first-month' }])
  expect(created[0].metadata.returnOffer).toBe('1')
  expect(expired).toEqual([previous])
})

test('an open Stripe checkout must belong to the buyer to unlock the return offer', async () => {
  const source = readFileSync(new URL('./web-return-offer.ts', import.meta.url), 'utf8')
    .replace(/^import .*\n/gm, '').replace('export async function', 'async function')
  const scope: any = {
    ApiError, CREATOR_MONTHLY_COUPON: 'first-month',
    isFirstSubscriptionEligible: async () => true,
    getStripe: () => ({
      checkout: { sessions: { retrieve: async () => ({ client_reference_id: 'owner', metadata: { source: 'web_analysis' }, status: 'open', payment_status: 'unpaid' }) } },
      subscriptions: { list: async () => ({ data: [] }) },
      coupons: { retrieve: async () => ({ valid: true, percent_off: 10, duration: 'once' }) },
    }),
  }
  compile(source + '\nglobalThis.validate = validateWebReturnOffer', scope)
  await expect(scope.validate('other-account', 'cs_live_fixture', 'cus_other')).rejects.toMatchObject({ status: 409 })
  await expect(scope.validate('owner', 'cs_live_fixture', 'cus_owner')).resolves.toMatchObject({ status: 'open' })
})

test('report quote endpoint returns the configured provider price and rejects other products', async () => {
  const scope: any = { z, createHash, stripeJourneyProperties, ApiError,
    getProductConfig: () => ({unitAmount: 999}),
    validateCheckoutProduct: async () => ({currency: 'eur', unit_amount: 599}),
    methodNotAllowed: () => ({status: 405}),
    json: (_res: unknown, status: number, data: unknown) => ({status, data}),
    handleApiError: (error: any) => ({status: error.status || 400}),
  }
  const source = readFileSync(new URL('../../pages/api/payments/report-price.ts', import.meta.url),'utf8').replace(/^import .*\n/gm,'').replace('export default async function handler','async function handler')
  compile(source+'\nglobalThis.handler=handler',scope)
  const run = (product: string) => scope.handler({method:'GET',query:{product}},{setHeader() {}})
  expect(await run('evaluation')).toEqual({status:200,data:{product:'evaluation',currency:'eur',amount:599}})
  expect((await run('mobile_lifetime')).status).toBe(400)
  scope.validateCheckoutProduct = async () => ({currency:'usd',unit_amount:null})
  expect((await run('evaluation')).status).toBe(503)
})


test('verified access returns original journey context and deduplicates activation callbacks', async () => {
  const events: any[] = []
  const metadata = { flowId: crypto.randomUUID(), attemptId: crypto.randomUUID(), flowVersion: 'fixture', entryMode: 'photo_first' }
  const f = route('confirm', {
    confirmCheckoutForAccount: async () => ({ mobileInstallId: 'fixture', source: 'web_analysis', product: 'evaluation', metadata }),
    getEntitlementSummary: async () => ({ evaluationCredits: 1, subscription: { active: false } }),
    recordServerEvent: async (event: unknown) => events.push(event),
  })
  const first = await f.run()
  expect(first.status).toBe(200)
  expect(first.data.analytics).toMatchObject({ flow_id: metadata.flowId, attempt_id: metadata.attemptId })
  await f.run()
  expect(events).toHaveLength(2)
  expect(events[0].eventId).toBe(events[1].eventId)
  expect(events[0]).toMatchObject({ eventName: 'purchase_activated', accountId: 'buyer', source: 'stripe_access_verified' })
})
