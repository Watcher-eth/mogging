import { and, eq, sql } from 'drizzle-orm'
import type Stripe from 'stripe'
import { db } from '@/lib/db'
import { creatorProfiles } from '@/lib/db/schema'
import { getOrCreateCreatorProfile } from '@/lib/creator/service'
import { env } from '@/lib/env'
import { getStripe } from '@/lib/payments/stripe'
import { ApiError } from '@/lib/api/http'
import { courseSellers, courseAudit } from './schema'
import { siteUrl } from './http'
import { sellerSchema } from './validation'

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
export function accountEligible(account: Stripe.Account) {
  return account.controller?.stripe_dashboard?.type === 'full' && account.controller?.fees?.payer === 'account' && account.controller?.losses?.payments === 'stripe'
}
export async function syncSeller(seller: typeof courseSellers.$inferSelect) {
  if (!seller.stripeAccountId || !seller.stripeConnected) return seller
  const account = await getStripe().accounts.retrieve(seller.stripeAccountId)
  const eligible = accountEligible(account)
  const [updated] = await db.update(courseSellers).set({ chargesEnabled: eligible && account.charges_enabled, payoutsEnabled: eligible && account.payouts_enabled, requirements: account.requirements?.currently_due || [], stripeSyncedAt: new Date(), updatedAt: new Date() }).where(and(eq(courseSellers.id, seller.id), eq(courseSellers.stripeAccountId, account.id))).returning()
  if (!updated) throw new ApiError(409, 'Seller connection changed; retry')
  return updated
}
export async function onboarding(userId: string, email: string) {
  const seller = await sellerForUser(userId)
  if (seller.status === 'suspended') throw new ApiError(403, 'Seller is suspended')
  if (!seller.stripeAccountId) {
    // Stable idempotency key recovers an account after a crash before DB persistence.
    const account = await getStripe().accounts.create({ country: seller.country, email, controller: { fees: { payer: 'account' }, losses: { payments: 'stripe' }, requirement_collection: 'stripe', stripe_dashboard: { type: 'full' } }, capabilities: { card_payments: { requested: true }, transfers: { requested: true } }, metadata: { moggingCourseSellerId: seller.id } }, { idempotencyKey: `course-account-${seller.id}` })
    const [connected] = await db.update(courseSellers).set({ stripeAccountId: account.id, stripeConnected: true, stripeLivemode: env.STRIPE_SECRET_KEY?.startsWith('sk_live_') || false, updatedAt: new Date() }).where(and(eq(courseSellers.id, seller.id), sql`${courseSellers.stripeAccountId} is null`)).returning()
    if (!connected) throw new ApiError(409, 'Another Stripe connection finished; reload your seller profile')
    seller.stripeAccountId = account.id
  }
  const link = await getStripe().accountLinks.create({ account: seller.stripeAccountId!, type: 'account_onboarding', refresh_url: `${siteUrl()}/creator/courses?connect=refresh`, return_url: `${siteUrl()}/creator/courses?connect=returned` })
  return { url: link.url, expiresAt: new Date(link.expires_at * 1000).toISOString() }
}
export async function changeSellerStatus(id: string, status: 'enabled' | 'pending' | 'suspended', actorUserId: string) {
  return db.transaction(async tx => {
    const [seller] = await tx.update(courseSellers).set({ status, updatedAt: new Date() }).where(eq(courseSellers.id, id)).returning()
    if (!seller) throw new ApiError(404, 'Seller not found')
    await tx.insert(courseAudit).values({ sellerId: id, actorUserId, action: `seller.${status}` })
    return seller
  })
}
