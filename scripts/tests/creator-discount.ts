import { mock } from 'bun:test'
import assert from 'node:assert/strict'
import * as schema from '../../lib/db/schema'
import { ApiError } from '../../lib/api/http'

// Use a configured multi-currency price fixture, never a live Stripe price.
process.env.STRIPE_MOBILE_MONTHLY_PRICE_ID = 'price_localcurrencytest'

let account: string | null = 'discount-test-account'
let active = true, priorEntitlement = false, priorEvent = false, rcHistory = false, rcUnavailable = false, stripeHistory = false
const attribution = { token: '', clickId: 'click', trackingLinkId: 'creator', firstClickId: 'click', firstTrackingLinkId: 'creator', attributionKey: 'key' }
let context: typeof attribution | null = attribution
let pending: any[] = [], created: any[] = []
let queue: Promise<unknown> = Promise.resolve()
mock.module('../../lib/db', () => ({ schema, db: {
  query: {
    creatorTrackingLinks: { findFirst: async () => active ? { id: 'creator' } : null },
    paymentEntitlements: { findFirst: async () => priorEntitlement ? { id: 'old' } : null },
    subscriptionEvents: { findFirst: async () => priorEvent ? { id: 'old' } : null },
  },
  transaction: (fn: any) => { const result = queue.then(() => fn({ execute: async () => {} })); queue = result.catch(() => null); return result },
} }))
mock.module('../../lib/api/rateLimit', () => ({ enforceRateLimit: async () => {} }))
mock.module('../../lib/auth/mobile-session', () => ({ getRequestUserId: async () => account }))
mock.module('../../lib/analytics/events', () => ({ recordServerEvent: async () => {} }))
mock.module('../../lib/creator/attribution', () => ({
  resolveCreatorAttribution: async () => context, getStoredMobileCreatorAttribution: async () => null,
  stripeAttributionMetadata: () => context ? { creatorTrackingLinkId: context.trackingLinkId, creatorClickId: context.clickId } : {},
  recordCreatorCheckout: async () => {},
}))
mock.module('../../lib/payments/revenuecat', () => ({ readRevenueCatPro: () => null, readRevenueCatScanPurchases: () => [], readRevenueCatScanSubscription: () => null, fetchRevenueCatSubscriber: async () => {
  if (rcUnavailable) throw new ApiError(503, 'Provider unavailable')
  return { subscriptions: rcHistory ? { 'mogging.pro.monthly': { expires_date: '2020-01-01', refunded_at: '2020-01-02' } } : {} }
} }))
mock.module('../../lib/payments/stripe', () => ({ getStripe: () => ({
  customers: { search: async () => ({ data: [{ id: 'cus_test' }] }) },
  subscriptions: { list: async () => ({ data: stripeHistory ? [{ id: 'sub_old', status: 'canceled' }] : [] }) },
  prices: { retrieve: async () => ({ active: true, currency: 'usd', unit_amount: 999, currency_options: { eur: { unit_amount: 1099 }, chf: { unit_amount: 1199 } }, recurring: { interval: 'month' } }) },
  coupons: { retrieve: async () => ({ valid: true, duration: 'once', percent_off: 10 }) },
  checkout: { sessions: {
    list: async () => ({ data: pending }),
    expire: async (id: string) => { pending = pending.filter(session => session.id !== id) },
    create: async (params: any) => { created.push(params); const session = { id: `cs_${created.length}`, url: 'https://checkout.stripe.com/test', metadata: params.metadata, currency: params.currency, locale: params.locale }; if (params.discounts) pending.push(session); return session },
  } },
}) }))
mock.module('../../lib/payments/billing-ledger', () => ({ linkRevenueCatIdentity: async () => {} }))
const { default: checkout } = await import('../../pages/api/payments/web-checkout')
const { default: offer } = await import('../../pages/api/payments/creator-discount')
async function call(handler: any, body: unknown) {
  let status = 200, result: any
  const res = { setHeader: () => {}, status: (code: number) => { status = code; return res }, json: (value: any) => { result = value; return res } }
  await handler({ method: 'POST', body, headers: { host: 'localhost:3000' } }, res)
  return { status, result }
}
const monthly = { product: 'mobile_subscription_monthly', mobileInstallId: 'discount-test-install' }
function reset() { active = true; priorEntitlement = priorEvent = rcHistory = rcUnavailable = stripeHistory = false; context = attribution; pending = []; created = []; account = 'discount-test-account' }
reset()
assert.equal((await call(checkout, monthly)).status, 200)
assert.equal(created[0].discounts[0].coupon, 'mogging_creator_first_month_10')
assert.equal(created[0].allow_promotion_codes, undefined, 'No stacking promotions')
assert.equal(created[0].subscription_data.metadata.creatorTrackingLinkId, 'creator')
const before = created.length
await Promise.all([call(checkout, monthly), call(checkout, monthly)])
assert.equal(created.length, before, 'Repeated and concurrent requests reuse the open discount checkout')
context = { ...attribution, clickId: 'another-click' }
await call(checkout, monthly)
assert.equal(pending.length, 1, 'Changing creator touch expires the prior discount checkout')
assert.equal(created.at(-1).metadata.creatorClickId, 'another-click')
reset()
const appleOffer = await call(offer, { mobileInstallId: monthly.mobileInstallId, attributionToken: 'x'.repeat(50) })
assert.equal(appleOffer.result.data.eligible, true)
assert.equal(appleOffer.result.data.appleProductId, 'mogging.pro.monthly.creator')
assert.equal(appleOffer.result.data.appleCode, undefined)
assert.equal(appleOffer.result.data.appleRedemptionUrl, undefined)
for (const history of ['entitlement', 'event', 'revenuecat', 'stripe', 'inactive'] as const) {
  reset(); priorEntitlement = history === 'entitlement'; priorEvent = history === 'event'; rcHistory = history === 'revenuecat'; stripeHistory = history === 'stripe'; active = history !== 'inactive'
  assert.equal((await call(checkout, monthly)).status, 200)
  assert.equal(created[0].discounts, undefined, history)
}
reset(); context = null
await call(checkout, monthly)
assert.equal(created[0].discounts, undefined)
for (const product of ['mobile_subscription_weekly', 'mobile_subscription_yearly', 'mobile_lifetime']) {
  reset(); await call(checkout, { ...monthly, product }); assert.equal(created[0].discounts, undefined, product)
}
reset(); rcUnavailable = true
assert.equal((await call(checkout, monthly)).status, 503)
assert.equal(created.length, 0, 'Provider failure must not silently charge full price')
reset(); account = null
assert.equal((await call(checkout, monthly)).status, 401)
assert.equal((await call(offer, { mobileInstallId: monthly.mobileInstallId, attributionToken: 'x'.repeat(50) })).status, 401)
reset(); rcHistory = true
assert.equal((await call(offer, { mobileInstallId: monthly.mobileInstallId, attributionToken: 'x'.repeat(50) })).result.data.eligible, false)
assert.equal((await call(checkout, { ...monthly, product: 'invalid' })).status, 400)
console.log('PASS: monthly-only discount, attribution, no stacking, retries, concurrent requests, inactive creators, expired/refunded history, unauthenticated requests and provider failures.')

reset()
const euro = { ...monthly, currency: 'eur', unitAmount: 1099, locale: 'de', returnLocale: 'de' }
assert.equal((await call(checkout, euro)).status, 200)
assert.equal(created[0].currency, 'eur')
assert.equal(created[0].adaptive_pricing.enabled, false, 'Displayed currency stays selected')
assert.equal(created[0].locale, 'de')
assert.ok(created[0].cancel_url.includes('/de/?checkout=cancelled'), 'Cancellation returns to the chosen language')
assert.equal(created[0].metadata.quotedUnitAmount, '1099')
await call(checkout, euro)
assert.equal(created.length, 1, 'Matching currency and quote reuse the discount session')
await call(checkout, { ...euro, currency: 'chf', unitAmount: 1199 })
assert.equal(created.length, 2, 'Currency changes create a new matching checkout')
assert.equal(pending.length, 1, 'Old currency checkout is expired')
assert.equal(created[1].currency, 'chf')
assert.equal((await call(checkout, { ...euro, currency: 'mxn' })).status, 400)
assert.equal((await call(checkout, { ...euro, unitAmount: 999 })).status, 409)
assert.equal(created.length, 2, 'Unsupported currency and stale quotes create no session')
assert.equal((await call(checkout, { ...euro, currency: 'EUR' })).status, 400)
console.log('PASS: provider currency validation, quote changes, currency-aware discount reuse and checkout language.')

reset()
assert.equal((await call(checkout, { ...monthly, unitAmount: 999, locale: 'fr' })).status, 200)
assert.equal(created[0].currency, undefined, 'With no currency choice, preserve Stripe account currency behavior')
assert.equal(created[0].adaptive_pricing, undefined)
assert.equal((await call(checkout, { ...monthly, unitAmount: 1099 })).status, 409, 'Base currency quote still revalidated')
console.log('PASS: default Stripe currency behavior retained with base amount validation.')
