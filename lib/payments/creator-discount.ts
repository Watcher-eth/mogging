import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import type { NextApiRequest } from 'next'
import { getAccountCreatorAttribution, getStoredMobileCreatorAttribution, resolveCreatorAttribution, type CreatorAttributionContext } from '@/lib/creator/attribution'
import { fetchRevenueCatSubscriber } from './revenuecat'
import { getStripe } from './stripe'
import { WEB_ANALYSIS_CREATOR_COUPON, WEB_ANALYSIS_CREATOR_PERCENT, webAnalysisProducts, webAnalysisStripeProducts } from './web-analysis-plans'

export const APPLE_CREATOR_MONTHLY_PRODUCT_ID = 'mogging.pro.monthly.creator'
export const CREATOR_MONTHLY_COUPON = 'mogging_creator_first_month_10'

// History includes expired, refunded and trial subscriptions: this is a first-subscription offer.
export async function isCreatorDiscountEligible(accountId: string, attribution: CreatorAttributionContext | null) {
  if (!attribution) return false
  const link = await db.query.creatorTrackingLinks.findFirst({ where: and(eq(schema.creatorTrackingLinks.id, attribution.trackingLinkId), eq(schema.creatorTrackingLinks.isActive, true)), columns: { id: true } })
  return Boolean(link && await isFirstSubscriptionEligible(accountId))
}

export async function isFirstSubscriptionEligible(accountId: string) {
  const [entitlement, event] = await Promise.all([
    db.query.paymentEntitlements.findFirst({ where: and(eq(schema.paymentEntitlements.userId, accountId), inArray(schema.paymentEntitlements.product, ['mobile_subscription_weekly', 'mobile_subscription_monthly', 'mobile_subscription_yearly', 'mobile_lifetime', ...webAnalysisProducts])), columns: { id: true } }),
    db.query.subscriptionEvents.findFirst({ where: and(eq(schema.subscriptionEvents.accountId, accountId), inArray(schema.subscriptionEvents.eventName, ['trial_started', 'subscription_started', 'trial_converted', 'subscription_renewed', 'cancellation_scheduled', 'subscription_refunded', 'subscription_expired', 'subscription_reactivated'])), columns: { id: true } }),
  ])
  if (entitlement || event) return false
  const subscriber = await fetchRevenueCatSubscriber(accountId, true)
  return !Object.keys(subscriber?.subscriptions ?? {}).length && !Object.keys(subscriber?.entitlements ?? {}).length
}

async function findCreatorStripeCustomer(accountId: string) {
  const customers = await getStripe().customers.search({ query: `metadata['moggingAccountId']:'${accountId.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`, limit: 1 })
  return customers.data[0]?.id
}

export async function getCreatorStripeCustomer(accountId: string) {
  const customer = await findCreatorStripeCustomer(accountId)
  if (customer) return customer
  // Stripe's idempotency protects initial creation.
  return (await getStripe().customers.create({ metadata: { moggingAccountId: accountId } }, { idempotencyKey: `creator-customer:${accountId}` })).id
}

export async function resolveCheckoutCreator(req: NextApiRequest, userId: string | null, mobileInstallId?: string) {
  const owner = { userId, mobileInstallId }
  return await resolveCreatorAttribution({ req, owner })
    || (mobileInstallId ? await getStoredMobileCreatorAttribution({ ...owner, mobileInstallId }) : null)
    || (userId ? await getAccountCreatorAttribution(userId) : null)
}

export async function hasStripeSubscriptionHistory(customer: string) {
  const subscriptions = await getStripe().subscriptions.list({ customer, status: 'all', limit: 1 })
  return subscriptions.data.length > 0
}

export async function getWebCreatorCoupon() {
  const coupon = await getStripe().coupons.retrieve(WEB_ANALYSIS_CREATOR_COUPON, { expand: ['applies_to'] })
  return coupon.valid && coupon.percent_off === WEB_ANALYSIS_CREATOR_PERCENT && coupon.duration === 'once'
    && Object.values(webAnalysisStripeProducts).every(product => coupon.applies_to?.products.includes(product)) ? coupon : null
}

export async function getWebCreatorOffer(req: NextApiRequest, userId: string | null, installId?: string) {
  const attribution = await resolveCheckoutCreator(req, userId, userId ? installId : undefined)
  if (!attribution) return null
  const { creatorProfiles, creatorSocialAccounts, creatorTrackingLinks } = schema
  const [creator] = await db.select({
    name: creatorSocialAccounts.displayName, handle: creatorSocialAccounts.handle,
    profileName: creatorProfiles.displayName, avatarUrl: creatorSocialAccounts.avatarUrl,
  }).from(creatorTrackingLinks)
    .innerJoin(creatorSocialAccounts, eq(creatorTrackingLinks.socialAccountId, creatorSocialAccounts.id))
    .innerJoin(creatorProfiles, eq(creatorSocialAccounts.creatorProfileId, creatorProfiles.id))
    .where(and(eq(creatorTrackingLinks.id, attribution.trackingLinkId), eq(creatorTrackingLinks.isActive, true)))
  if (!creator || (userId && !await isFirstSubscriptionEligible(userId))) return null
  const [coupon, customer] = await Promise.all([
    getWebCreatorCoupon(),
    userId ? findCreatorStripeCustomer(userId) : null,
  ])
  if (!coupon || (customer && await hasStripeSubscriptionHistory(customer))) return null
  return {
    name: creator.name?.trim() || creator.handle?.trim() || creator.profileName,
    avatarUrl: creator.avatarUrl?.startsWith('https://') ? creator.avatarUrl : null,
    percent: WEB_ANALYSIS_CREATOR_PERCENT,
  }
}
