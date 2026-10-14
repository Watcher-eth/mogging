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

const googleProduct = 'mogging.pro.monthly:monthly'
const google: RevenueCatSubscriber = {
  entitlements: { pro: { product_identifier: googleProduct, expires_date: '2099-02-01T00:00:00Z' } },
  subscriptions: { [googleProduct]: { purchase_date: '2099-01-01T00:00:00Z', expires_date: '2099-02-01T00:00:00Z', store_transaction_id: 'google-transaction', store: 'play_store' } },
}
assert.equal(readRevenueCatScanSubscription(google)?.plan, 'monthly')
assert.equal(readRevenueCatScanSubscription(google)?.key, 'revenuecat-subscription:play_store:google-transaction')
google.subscriptions![googleProduct].store = 'app_store'
assert.equal(readRevenueCatScanSubscription(google), null, 'Only verified Play products may normalize a base plan suffix')
console.log('PASS: Google Play base plans activate their existing allowance; other stores do not normalize unknown IDs.')
