import assert from 'node:assert/strict'
import { getStripe } from '../../lib/payments/stripe'
import { env } from '../../lib/env'
import { CREATOR_MONTHLY_COUPON } from '../../lib/payments/creator-discount'

assert.ok(env.STRIPE_SECRET_KEY?.startsWith('sk_test_'), 'Only Stripe test credentials may run this test')
const stripe = getStripe()
const now = Math.floor(Date.now() / 1000)
const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name: 'Creator first-month discount test' })
try {
  const product = await stripe.products.create({ name: 'Creator monthly discount sandbox test' })
  const price = await stripe.prices.create({ product: product.id, currency: 'usd', unit_amount: 999, recurring: { interval: 'month' } })
  let coupon = await stripe.coupons.retrieve(CREATOR_MONTHLY_COUPON).catch(() => null)
  if (!coupon) coupon = await stripe.coupons.create({ id: CREATOR_MONTHLY_COUPON, percent_off: 10, duration: 'once' })
  assert.equal(coupon.percent_off, 10)
  assert.equal(coupon.duration, 'once')
  const customer = await stripe.customers.create({ test_clock: clock.id, metadata: { moggingAccountId: `sandbox-${clock.id}` } })
  const paymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id })
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: paymentMethod.id } })
  const subscription = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: price.id }], discounts: [{ coupon: coupon.id }], metadata: { creatorTrackingLinkId: 'sandbox-creator', creatorDiscount: coupon.id } })
  const first = await stripe.invoices.retrieve(subscription.latest_invoice as string)
  assert.equal(first.total, 899)
  assert.equal(first.status, 'paid')
  assert.equal(subscription.metadata.creatorTrackingLinkId, 'sandbox-creator')
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: now + 33 * 86400 })
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await stripe.testHelpers.testClocks.retrieve(clock.id)).status === 'ready') break
    await Bun.sleep(1000)
  }
  const invoices = await stripe.invoices.list({ customer: customer.id, limit: 10 })
  assert.ok(invoices.data.some(invoice => invoice.billing_reason === 'subscription_cycle' && invoice.total === 999), 'Renewal must be full price')
  assert.equal((await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 1 })).data.length, 1)
  await stripe.subscriptions.cancel(subscription.id)
  assert.equal((await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 1 })).data.length, 1, 'Canceled subscribers retain history')
  console.log('PASS: Stripe sandbox first invoice $8.99, renewal $9.99, creator attribution retained, canceled subscription history retained.')
  await stripe.products.update(product.id, { active: false })
} finally {
  await stripe.testHelpers.testClocks.del(clock.id)
}
