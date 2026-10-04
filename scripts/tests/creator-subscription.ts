import assert from 'node:assert/strict'
import { readRevenueCatScanSubscription, type RevenueCatSubscriber } from '../../lib/payments/revenuecat'
const product = 'mogging.pro.monthly.creator'
const subscriber: RevenueCatSubscriber = {
  entitlements: { pro: { product_identifier: product, expires_date: '2099-02-01T00:00:00Z' } },
  subscriptions: { [product]: { purchase_date: '2099-01-01T00:00:00Z', expires_date: '2099-02-01T00:00:00Z', store_transaction_id: 'creator-transaction', store: 'app_store' } },
}
const period = readRevenueCatScanSubscription(subscriber)
assert.equal(period?.plan, 'monthly', 'Creator subscriptions must receive the existing monthly scan allowance')
assert.equal(period?.key, 'revenuecat-subscription:app_store:creator-transaction')
subscriber.subscriptions![product].refunded_at = '2099-01-05T00:00:00Z'
assert.equal(readRevenueCatScanSubscription(subscriber), null)
console.log('PASS: creator product grants the normal monthly allowance, using its verified transaction; refunds revoke eligibility.')
