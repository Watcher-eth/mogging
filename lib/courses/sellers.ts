import { and, eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { creatorProfiles } from '@/lib/db/schema'
import { getOrCreateCreatorProfile } from '@/lib/creator/service'
import { getStripe } from '@/lib/payments/stripe'
import { ApiError } from '@/lib/api/http'
import { courseSellers, courseAudit } from './schema'
import { siteUrl } from './http'
import { sellerSchema } from './validation'
import { courseStripeOptions } from './stripe'

export async function sellerForUser(userId: string) {
  const [seller] = await db.select({ seller: courseSellers }).from(courseSellers).innerJoin(creatorProfiles, eq(courseSellers.creatorProfileId, creatorProfiles.id)).where(eq(creatorProfiles.userId, userId)).limit(1)
  if (!seller) throw new ApiError(404, 'Create a course seller profile first')
  return seller.seller
}
export async function saveSeller(userId: string, body: unknown) {
  const input = sellerSchema.parse(body), profile = await getOrCreateCreatorProfile(userId)
  return db.transaction(async tx => {
    const [existing] = await tx.select().from(courseSellers).where(eq(courseSellers.creatorProfileId, profile.id)).for('update')
    if (existing && (existing.country !== input.country || existing.slug !== input.slug)) throw new ApiError(409, 'Seller country and URL cannot be changed after registration')
    const [seller] = await tx.insert(courseSellers).values({ ...input, creatorProfileId: profile.id }).onConflictDoUpdate({ target: courseSellers.creatorProfileId, set: { bio: input.bio, supportEmail: input.supportEmail, updatedAt: new Date() } }).returning()
    return seller
  })
}
export function retrieveSellerAccount(id: string) {
  return getStripe().v2.core.accounts.retrieve(id, { include: ['configuration.merchant', 'defaults', 'identity', 'requirements'] }, courseStripeOptions)
}
export function accountEligible(account: Stripe.V2.Core.Account | Stripe.Account) {
  // Existing-account OAuth remains an Accounts v1 authentication flow.
  if (account.object === 'account') return account.controller?.stripe_dashboard?.type === 'full' && account.controller?.fees?.payer === 'account' && account.controller?.losses?.payments === 'stripe'
  return account.dashboard === 'full' && account.defaults?.responsibilities?.fees_collector === 'stripe' && account.defaults?.responsibilities?.losses_collector === 'stripe'
}
export async function syncSeller(seller: typeof courseSellers.$inferSelect) {
  if (!seller.stripeAccountId || !seller.stripeConnected) return seller
  const account = await retrieveSellerAccount(seller.stripeAccountId)
  if (account.livemode !== seller.stripeLivemode) throw new ApiError(409, 'Stripe account environment does not match this seller')
  const eligible = accountEligible(account) && account.identity?.country?.toUpperCase() === seller.country
  const capabilities = account.configuration?.merchant?.capabilities
  const requirements = [...new Set(account.requirements?.entries?.filter(entry => entry.awaiting_action_from === 'user').map(entry => entry.description) || [])]
  const [updated] = await db.update(courseSellers).set({ chargesEnabled: eligible && capabilities?.card_payments?.status === 'active', payoutsEnabled: eligible && capabilities?.stripe_balance?.payouts?.status === 'active', requirements, stripeSyncedAt: new Date(), updatedAt: new Date() }).where(and(eq(courseSellers.id, seller.id), eq(courseSellers.stripeAccountId, account.id), eq(courseSellers.stripeConnected, true))).returning()
  if (!updated) throw new ApiError(409, 'Seller connection changed; retry')
  return updated
}
export async function onboarding(userId: string, email: string) {
  const seller = await sellerForUser(userId)
  if (seller.status === 'suspended') throw new ApiError(403, 'Seller is suspended')
  if (!seller.stripeAccountId) {
    // Stable idempotency key recovers an account after a crash before DB persistence.
    // Collect real identity and terms in Stripe's hosted flow; no demo KYC values in production.
    const account = await getStripe().v2.core.accounts.create({ contact_email: email, display_name: seller.slug, dashboard: 'full', identity: { country: seller.country.toLowerCase() }, defaults: { responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' } }, configuration: { merchant: { capabilities: { card_payments: { requested: true } } } }, include: ['configuration.merchant', 'identity', 'requirements'], metadata: { moggingCourseSellerId: seller.id } }, { ...courseStripeOptions, idempotencyKey: `course-account-v2-${seller.id}` })
    const [connected] = await db.update(courseSellers).set({ stripeAccountId: account.id, stripeConnected: true, stripeLivemode: account.livemode, updatedAt: new Date() }).where(and(eq(courseSellers.id, seller.id), sql`${courseSellers.stripeAccountId} is null`)).returning()
    if (!connected) throw new ApiError(409, 'Another Stripe connection finished; reload your seller profile')
    Object.assign(seller, connected)
  }
  if (!seller.stripeConnected) throw new ApiError(409, 'Reconnect the same Stripe account before continuing onboarding')
  const account = await retrieveSellerAccount(seller.stripeAccountId!)
  if (account.livemode !== seller.stripeLivemode) throw new ApiError(409, 'Stripe account environment does not match this seller')
  // Legacy accounts can also have recipient/customer configurations; Stripe requires an exact match.
  const link = await getStripe().v2.core.accountLinks.create({ account: account.id, use_case: { type: 'account_onboarding', account_onboarding: { configurations: account.applied_configurations, refresh_url: `${siteUrl()}/creator/courses?connect=refresh`, return_url: `${siteUrl()}/creator/courses?connect=returned` } } }, courseStripeOptions)
  return { url: link.url, expiresAt: link.expires_at }
}
export async function changeSellerStatus(id: string, status: 'enabled' | 'pending' | 'suspended', actorUserId: string) {
  return db.transaction(async tx => {
    const [seller] = await tx.update(courseSellers).set({ status, updatedAt: new Date() }).where(eq(courseSellers.id, id)).returning()
    if (!seller) throw new ApiError(404, 'Seller not found')
    await tx.insert(courseAudit).values({ sellerId: id, actorUserId, action: `seller.${status}` })
    return seller
  })
}
