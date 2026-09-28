import { describe, expect, test } from 'bun:test'
import { mapRevenueCatAttributionEvent } from './attribution'

describe('RevenueCat creator attribution lifecycle mapping', () => {
  test.each([
    ['INITIAL_PURCHASE', 'payment', 1],
    ['RENEWAL', 'payment', 1],
    ['NON_RENEWING_PURCHASE', 'payment', 1],
    ['REFUND_REVERSED', 'payment', 1],
    ['REFUND', 'refund', -1],
    ['CANCELLATION', 'subscription_cancellation', 0],
    ['EXPIRATION', 'subscription_expiration', 0],
    ['BILLING_ISSUE', 'subscription_billing_issue', 0],
    ['UNCANCELLATION', 'subscription_reactivation', 0],
  ] as const)('%s maps to %s', (providerType, eventType, amountMultiplier) => {
    expect(mapRevenueCatAttributionEvent(providerType)).toMatchObject({ eventType, amountMultiplier })
  })

  test('ignores events that do not change attributed subscription state', () => {
    expect(mapRevenueCatAttributionEvent('TEST')).toBeNull()
    expect(mapRevenueCatAttributionEvent('PRODUCT_CHANGE')).toBeNull()
  })
  test('customer-support cancellation records refunded revenue', () => {
    expect(mapRevenueCatAttributionEvent('CANCELLATION', 'CUSTOMER_SUPPORT')).toMatchObject({ eventType: 'refund', amountMultiplier: -1 })
    expect(mapRevenueCatAttributionEvent('CANCELLATION', 'UNSUBSCRIBE')).toMatchObject({ eventType: 'subscription_cancellation', amountMultiplier: 0 })
  })
})
