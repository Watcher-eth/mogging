import { mock } from 'bun:test'
import assert from 'node:assert/strict'

let misconfigured = false
let inactive = false
let calls = 0
let clock = Date.now()
const actualNow = Date.now
Date.now = () => clock
mock.module('../../lib/payments/entitlements', () => ({ getProductConfig: (product: string) => ({
  priceId: misconfigured ? undefined : `price_${product}`,
  interval: product.endsWith('weekly') ? 'week' : product.endsWith('monthly') ? 'month' : 'year',
}) }))
mock.module('../../lib/payments/stripe', () => ({ getStripe: () => ({ prices: { retrieve: async (id: string, params: any) => {
  calls++
  assert.deepEqual(params.expand, ['currency_options'])
  const yearly = id.endsWith('yearly')
  const amount = id.endsWith('weekly') ? 499 : yearly ? 4999 : 999
  return { active: !inactive, billing_scheme: 'per_unit', currency: 'usd', unit_amount: amount,
    recurring: { interval: id.endsWith('weekly') ? 'week' : yearly ? 'year' : 'month', interval_count: 1 },
    currency_options: { eur: {unit_amount: amount + 100}, chf: {unit_amount: amount + 200}, ...(yearly ? {} : {mxn: {unit_amount: amount * 20}}) },
  }
} } }) }))
const { default: handler } = await import('../../pages/api/payments/subscription-prices')
async function call(country?: string, currency?: string) {
  let status = 0, body: any, cache: string | undefined
  const res = { setHeader: (key: string, value: string) => { if (key === 'Cache-Control') cache = value }, status: (code: number) => { status = code; return res }, json: (value: any) => { body = value; return res } }
  await handler({method:'GET', headers: {'x-vercel-ip-country':country}, query: currency ? {currency} : {}} as any, res as any)
  return {status,body,cache}
}
try {
  const de = await call('DE')
  assert.equal(de.status, 200)
  assert.equal(de.body.data.currency, 'eur')
  assert.equal(de.body.data.amounts.mobile_subscription_weekly, 599)
  assert.deepEqual(de.body.data.availableCurrencies, ['chf','eur','usd'])
  assert.equal(de.cache, 'private, no-store')
  assert.equal((await call('CH')).body.data.currency, 'chf')
  assert.equal((await call('AT')).body.data.currency, 'eur')
  assert.equal((await call('MX')).body.data.currency, 'usd', 'Never invent missing regional amounts')
  assert.equal((await call('DE','CHF')).body.data.currency, 'chf')
  assert.equal((await call('DE','invalid')).status, 400)
  assert.equal(calls, 3, 'Stripe price cache is reused without caching visitor geography')
  clock += 61_000
  inactive = true
  assert.equal((await call('DE')).status, 503)
  inactive = false
  misconfigured = true
  assert.equal((await call('DE')).status, 503)
  console.log('PASS: country defaults, configured currency intersection, provider cache, unsupported market fallback, malformed input and missing/inactive price failures.')
} finally {
  Date.now = actualNow
}
