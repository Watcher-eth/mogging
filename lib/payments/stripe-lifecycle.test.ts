import { expect, test } from 'bun:test'
import type Stripe from 'stripe'
import { normalizeStripeLifecycle } from './stripe-lifecycle'
const event = (type: string, object: Record<string, unknown>, previous_attributes = {}) => ({
  id: 'evt_test', type, created: 1000, livemode: false, data: { object, previous_attributes },
}) as unknown as Stripe.Event
test('subscription checkout does not double-count invoice revenue', () => {
  expect(normalizeStripeLifecycle(event('checkout.session.completed', { id: 'cs', mode: 'subscription', payment_status: 'paid', amount_total: 999 }))?.amount).toBeNull()
  expect(normalizeStripeLifecycle(event('invoice.paid', { id: 'in', amount_paid: 999, currency: 'usd', billing_reason: 'subscription_cycle' }))).toMatchObject({ amount: '9.99', eventName: 'subscription_renewed' })
})
test('delayed checkout and refund notifications have transaction-level dedupe keys', () => {
  const purchase = { id: 'cs', mode: 'payment', payment_status: 'paid', amount_total: 500, currency: 'jpy' }
  const first = normalizeStripeLifecycle(event('checkout.session.completed', purchase))!
  const repeated = normalizeStripeLifecycle(event('checkout.session.async_payment_succeeded', purchase))!
  expect(first.providerEventId).toBe(repeated.providerEventId)
  expect(first.amount).toBe('500')
  expect(normalizeStripeLifecycle(event('invoice.paid', { amount_paid: 500, currency: 'ugx' }))?.amount).toBe('5')
  expect(normalizeStripeLifecycle(event('refund.updated', { id: 're', status: 'pending', amount: 100 }))).toBeNull()
  expect(normalizeStripeLifecycle(event('refund.created', { id: 're', status: 'succeeded', amount: 100, currency: 'usd' }))).toMatchObject({ providerEventId: 'refund:re', amount: '-1' })
})
test('cancellation intent and trial conversion are not actual expiration', () => {
  expect(normalizeStripeLifecycle(event('customer.subscription.updated', { id: 'sub', cancel_at_period_end: true }, { cancel_at_period_end: false }))?.eventName).toBe('cancellation_scheduled')
  expect(normalizeStripeLifecycle(event('customer.subscription.updated', { id: 'sub', status: 'active' }, { status: 'trialing' }))?.eventName).toBe('trial_converted')
})
