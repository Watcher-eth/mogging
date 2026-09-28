import { describe, expect, test } from 'bun:test'
import { normalizeRevenueCat, revenueCatEventSchema, revenueCatLifecycle } from './subscription-events'

describe('billing facts', () => {
  test.each([
    ['INITIAL_PURCHASE', 'subscription_started'], ['RENEWAL', 'subscription_renewed'],
    ['NON_RENEWING_PURCHASE', 'one_time_purchase'], ['UNCANCELLATION', 'subscription_reactivated'],
    ['BILLING_ISSUE', 'billing_issue_started'], ['PRODUCT_CHANGE', 'subscription_product_changed'],
    ['SUBSCRIPTION_PAUSED', 'subscription_pause_scheduled'], ['SUBSCRIPTION_EXTENDED', 'subscription_extended'],
    ['REFUND_REVERSED', 'refund_reversed'], ['TRANSFER', 'subscription_transferred'],
    ['TEMPORARY_ENTITLEMENT_GRANT', 'temporary_entitlement_granted'], ['TEST', 'billing_test'],
    ['FUTURE_PROVIDER_TYPE', 'billing_other'],
  ])('%s has an explicit lifecycle classification', (type, expected) => {
    expect(normalizeRevenueCat({ id: 'fixture', type }).eventName).toBe(expected)
  })
  test('cancellation intent, refund, trial, and expiration have distinct semantics', () => {
    expect(revenueCatLifecycle({ type: 'CANCELLATION', cancel_reason: 'UNSUBSCRIBE' })).toBe('cancellation_scheduled')
    expect(revenueCatLifecycle({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT' })).toBe('subscription_refunded')
    expect(revenueCatLifecycle({ type: 'INITIAL_PURCHASE', period_type: 'TRIAL' })).toBe('trial_started')
    expect(revenueCatLifecycle({ type: 'RENEWAL', is_trial_conversion: true })).toBe('trial_converted')
    expect(revenueCatLifecycle({ type: 'EXPIRATION' })).toBe('subscription_expired')
  })
  test('refund is negative, and USD fallback never inherits another currency', () => {
    const base = { id: 'event', type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', price: 5, currency: 'JPY' }
    expect(normalizeRevenueCat(base)).toMatchObject({ amount: '-5', currency: 'USD' })
    expect(normalizeRevenueCat({ ...base, price_in_purchased_currency: -700 })).toMatchObject({ amount: '-700', currency: 'JPY' })
    expect(normalizeRevenueCat({ ...base, cancel_reason: 'UNSUBSCRIBE' }).amount).toBe('0')
  })
  test('transfer without app_user_id is accepted; private subscriber values are not retained', () => {
    const input = revenueCatEventSchema.parse({ id: 'transfer', type: 'TRANSFER', transferred_to: ['new'], subscriber_attributes: { $email: { value: 'secret' } } })
    const fact = normalizeRevenueCat(input)
    expect(fact.externalUserId).toBe('new')
    expect(JSON.stringify(fact)).not.toContain('secret')
  })
  test('provider time is retained for late and out-of-order delivery; test traffic is isolated', () => {
    expect(normalizeRevenueCat({ id: 'late', type: 'RENEWAL', event_timestamp_ms: 1000 }).occurredAt.getTime()).toBe(1000)
    expect(normalizeRevenueCat({ id: 'test', type: 'TEST', environment: 'PRODUCTION' }).environment).toBe('sandbox')
  })
})
