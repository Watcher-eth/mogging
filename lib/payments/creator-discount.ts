import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { CreatorAttributionContext } from '@/lib/creator/attribution'
import { fetchRevenueCatSubscriber } from './revenuecat'
import { getStripe } from './stripe'

export const APPLE_CREATOR_MONTHLY_PRODUCT_ID = 'mogging.pro.monthly.creator'
export const CREATOR_MONTHLY_COUPON = 'mogging_creator_first_month_10'

// History includes expired, refunded and trial subscriptions: this is a first-subscription offer.
export async function isCreatorDiscountEligible(accountId: string, attribution: CreatorAttributionContext | null) {
  if (!attribution) return false
  const [link, entitlement, event] = await Promise.all([
    db.query.creatorTrackingLinks.findFirst({ where: and(eq(schema.creatorTrackingLinks.id, attribution.trackingLinkId), eq(schema.creatorTrackingLinks.isActive, true)), columns: { id: true } }),
    db.query.paymentEntitlements.findFirst({ where: and(eq(schema.paymentEntitlements.userId, accountId), inArray(schema.paymentEntitlements.product, ['mobile_subscription_weekly', 'mobile_subscription_monthly', 'mobile_subscription_yearly', 'mobile_lifetime'])), columns: { id: true } }),
    db.query.subscriptionEvents.findFirst({ where: and(eq(schema.subscriptionEvents.accountId, accountId), inArray(schema.subscriptionEvents.eventName, ['trial_started', 'subscription_started', 'trial_converted', 'subscription_renewed', 'cancellation_scheduled', 'subscription_refunded', 'subscription_expired', 'subscription_reactivated'])), columns: { id: true } }),
  ])
  if (!link || entitlement || event) return false
  const subscriber = await fetchRevenueCatSubscriber(accountId, true)
  return !Object.keys(subscriber?.subscriptions ?? {}).length && !Object.keys(subscriber?.entitlements ?? {}).length
}

export async function getCreatorStripeCustomer(accountId: string) {
  // Stripe's idempotency protects initial creation; subsequent requests find the same customer.
  const customers = await getStripe().customers.search({ query: `metadata['moggingAccountId']:'${accountId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, limit: 1 })
  if (customers.data[0]) return customers.data[0].id
  return (await getStripe().customers.create({ metadata: { moggingAccountId: accountId } }, { idempotencyKey: `creator-customer:${accountId}` })).id
}
