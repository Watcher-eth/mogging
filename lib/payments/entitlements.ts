import { and, eq, gt, or, sql } from 'drizzle-orm'
import Stripe from 'stripe'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { verifyRevenueCatPro } from '@/lib/payments/revenuecat'
import { getStripe } from './stripe'
import type { PaymentProduct } from '@/lib/db/schema'

export const paymentProductSchemaValues = [
  'evaluation',
  'evaluation_pack_3',
  'mobile_subscription_weekly',
  'mobile_subscription_monthly',
  'mobile_subscription_yearly',
  'mobile_lifetime',
  'extra_potential_image',
] as const

type ProductConfig = {
  mode: 'payment' | 'subscription'
  name: string
  description: string
  credits: number
  priceId?: string
  unitAmount: number
  interval?: 'week' | 'month' | 'year'
}

export type EntitlementSummary = {
  mobileInstallId: string
  evaluationCredits: number
  extras: {
    potentialImages: number
  }
  subscription: {
    active: boolean
    status: string | null
    currentPeriodEnd: string | null
  }
}

type EntitlementOwner = {
  mobileInstallId: string
  userId?: string | null
  anonymousActorId?: string | null
  revenueCatAppUserId?: string | null
}

export function getProductConfig(product: PaymentProduct): ProductConfig {
  switch (product) {
    case 'evaluation':
      return {
        mode: 'payment',
        name: 'Mogging Evaluation',
        description: 'One private AI facial evaluation credit for a single Mogging report.',
        credits: 1,
        priceId: env.STRIPE_EVALUATION_PRICE_ID,
        unitAmount: env.STRIPE_ANALYSIS_PRICE_CENTS,
      }
    case 'evaluation_pack_3':
      return {
        mode: 'payment',
        name: 'Mogging Evaluation 3 Pack',
        description: 'Three private AI facial evaluation credits for generating three separate Mogging reports.',
        credits: 3,
        priceId: env.STRIPE_EVALUATION_PACK_3_PRICE_ID,
        unitAmount: env.STRIPE_EVALUATION_PACK_3_PRICE_CENTS,
      }
    case 'mobile_subscription_weekly':
      return {
        mode: 'subscription',
        name: 'Mogging Pro Weekly',
        description: 'Weekly Mogging Pro access with regular evaluations, progress tracking, report history, and eligible member extras.',
        credits: 0,
        priceId: env.STRIPE_MOBILE_WEEKLY_PRICE_ID,
        unitAmount: env.STRIPE_MOBILE_WEEKLY_PRICE_CENTS,
        interval: 'week',
      }
    case 'mobile_subscription_monthly':
      return {
        mode: 'subscription',
        name: 'Mogging Pro Monthly',
        description: 'Monthly Mogging Pro access with regular evaluations, progress tracking, report history, and eligible member extras.',
        credits: 0,
        priceId: env.STRIPE_MOBILE_MONTHLY_PRICE_ID,
        unitAmount: env.STRIPE_MOBILE_MONTHLY_PRICE_CENTS,
        interval: 'month',
      }
    case 'mobile_subscription_yearly':
      return {
        mode: 'subscription',
        name: 'Mogging Pro Yearly',
        description: 'Yearly Mogging Pro access with regular evaluations, progress tracking, report history, and eligible member extras.',
        credits: 0,
        priceId: env.STRIPE_MOBILE_YEARLY_PRICE_ID,
        unitAmount: env.STRIPE_MOBILE_YEARLY_PRICE_CENTS,
        interval: 'year',
      }
    case 'mobile_lifetime':
      return {
        mode: 'payment',
        name: 'Mogging Lifetime',
        description: 'One-time lifetime Mogging Pro access with regular evaluations, progress tracking, report history, and eligible member extras.',
        credits: 0,
        priceId: env.STRIPE_MOBILE_LIFETIME_PRICE_ID,
        unitAmount: env.STRIPE_MOBILE_LIFETIME_PRICE_CENTS,
      }
    case 'extra_potential_image':
      return {
        mode: 'payment',
        name: 'Potential Image Extra',
        description: 'One optional AI potential-image generation extra for an existing Mogging evaluation report.',
        credits: 1,
        priceId: env.STRIPE_EXTRA_POTENTIAL_IMAGE_PRICE_ID,
        unitAmount: env.STRIPE_EXTRA_POTENTIAL_IMAGE_PRICE_CENTS,
      }
  }
}

export function getCheckoutLineItem(product: PaymentProduct) {
  const config = getProductConfig(product)
  if (config.priceId) {
    return {
      price: config.priceId,
      quantity: 1,
    }
  }

  return {
    price_data: {
      currency: 'usd',
      product_data: {
        name: config.name,
        description: config.description,
      },
      unit_amount: config.unitAmount,
      ...(config.interval
        ? {
            recurring: {
              interval: config.interval,
            },
          }
        : null),
    },
    quantity: 1,
  }
}

export async function claimStripeCheckoutSession({
  mobileInstallId,
  sessionId,
  userId,
  anonymousActorId,
}: {
  mobileInstallId: string
  sessionId: string
  userId: string | null
  anonymousActorId: string | null
}) {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription'],
  })

  await grantEntitlementFromCheckoutSession({
    session,
    mobileInstallId,
    userId,
    anonymousActorId,
  })

  return getEntitlementSummary({ mobileInstallId, userId, anonymousActorId })
}

export async function grantEntitlementFromCheckoutSession({
  session,
  mobileInstallId: expectedMobileInstallId,
  userId,
  anonymousActorId,
}: {
  session: Stripe.Checkout.Session
  mobileInstallId?: string | null
  userId?: string | null
  anonymousActorId?: string | null
}) {
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw new ApiError(402, 'Checkout has not completed')
  }

  const product = readPaymentProduct(session.metadata?.product)
  const metadataInstallId = session.metadata?.mobileInstallId
  const mobileInstallId = expectedMobileInstallId || metadataInstallId
  if (!mobileInstallId) {
    throw new ApiError(400, 'Checkout is missing mobile install id')
  }
  if (expectedMobileInstallId && metadataInstallId && metadataInstallId !== expectedMobileInstallId) {
    throw new ApiError(403, 'Checkout belongs to another app install')
  }

  const subscription = typeof session.subscription === 'object' && session.subscription
    ? session.subscription
    : null
  const subscriptionStatus = subscription?.status ?? (isProAccessProduct(product) ? 'active' : null)
  const currentPeriodEnd = readSubscriptionPeriodEnd(subscription)
  const credits = product === 'extra_potential_image' ? 0 : getProductConfig(product).credits
  const extras = product === 'extra_potential_image' ? 1 : 0

  await db
    .insert(schema.paymentEntitlements)
    .values({
      mobileInstallId,
      userId: userId ?? readOptionalMetadata(session.metadata?.userId),
      anonymousActorId: anonymousActorId ?? readOptionalMetadata(session.metadata?.anonymousActorId),
      stripeCheckoutSessionId: session.id,
      stripeCustomerId: readStripeId(session.customer),
      stripeSubscriptionId: readStripeId(session.subscription),
      stripePaymentIntentId: readStripeId(session.payment_intent),
      product,
      creditBalance: credits,
      subscriptionStatus,
      currentPeriodEnd,
      source: session.metadata?.source ?? null,
      metadata: {
        checkoutMode: session.mode,
        stripePaymentStatus: session.payment_status,
        extras: {
          potentialImages: extras,
        },
      },
    })
    .onConflictDoNothing({
      target: schema.paymentEntitlements.stripeCheckoutSessionId,
    })
}

export async function updateSubscriptionEntitlement(subscription: Stripe.Subscription) {
  await db
    .update(schema.paymentEntitlements)
    .set({
      subscriptionStatus: subscription.status,
      currentPeriodEnd: readSubscriptionPeriodEnd(subscription),
      stripeCustomerId: readStripeId(subscription.customer),
      updatedAt: new Date(),
    })
    .where(eq(schema.paymentEntitlements.stripeSubscriptionId, subscription.id))
}

export async function revokePaymentIntentEntitlement({
  paymentIntentId,
  status,
}: {
  paymentIntentId: string
  status: 'refunded' | 'disputed'
}) {
  await db
    .update(schema.paymentEntitlements)
    .set({
      creditBalance: 0,
      subscriptionStatus: status,
      updatedAt: new Date(),
    })
    .where(eq(schema.paymentEntitlements.stripePaymentIntentId, paymentIntentId))
}

export async function getEntitlementSummary(ownerInput: string | EntitlementOwner): Promise<EntitlementSummary> {
  const owner = normalizeEntitlementOwner(ownerInput)
  const rows = await db.query.paymentEntitlements.findMany({
    where: getOwnerWhere(owner),
  })
  const now = Date.now()
  const activeSubscriptions = rows.filter((row) => {
    if (!isProAccessProduct(row.product)) return false
    if (row.subscriptionStatus && !['active', 'trialing', 'complete'].includes(row.subscriptionStatus)) return false
    if (row.product === 'mobile_lifetime') return true
    return !row.currentPeriodEnd || row.currentPeriodEnd.getTime() > now
  })
  const latestSubscription = activeSubscriptions
    .slice()
    .sort((a, b) => (b.currentPeriodEnd?.getTime() ?? 0) - (a.currentPeriodEnd?.getTime() ?? 0))[0]
  const revenueCatSubscription = latestSubscription ? null : await getRevenueCatSubscription(owner)

  return {
    mobileInstallId: owner.mobileInstallId,
    evaluationCredits: rows
      .filter((row) => row.product !== 'extra_potential_image')
      .reduce((sum, row) => sum + row.creditBalance, 0),
    extras: {
      potentialImages: rows
        .filter((row) => row.product === 'extra_potential_image')
        .reduce((sum, row) => sum + readPotentialImageExtras(row.metadata), 0),
    },
    subscription: {
      active: Boolean(latestSubscription) || Boolean(revenueCatSubscription?.active),
      status: latestSubscription?.subscriptionStatus ?? revenueCatSubscription?.status ?? null,
      currentPeriodEnd: latestSubscription?.currentPeriodEnd?.toISOString() ?? revenueCatSubscription?.currentPeriodEnd?.toISOString() ?? null,
    },
  }
}

export async function consumeEvaluationEntitlement(ownerInput: string | EntitlementOwner) {
  const owner = normalizeEntitlementOwner(ownerInput)
  const summary = await getEntitlementSummary(owner)
  if (summary.subscription.active) return summary

  const [updated] = await db
    .update(schema.paymentEntitlements)
    .set({
      creditBalance: sql`${schema.paymentEntitlements.creditBalance} - 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        getOwnerWhere(owner),
        gt(schema.paymentEntitlements.creditBalance, 0)
      )
    )
    .returning({ id: schema.paymentEntitlements.id })

  if (!updated) {
    throw new ApiError(402, 'Buy an evaluation or subscription before generating this report')
  }

  return getEntitlementSummary(owner)
}

export async function assertEvaluationEntitlement(ownerInput: string | EntitlementOwner) {
  const summary = await getEntitlementSummary(ownerInput)
  if (summary.subscription.active || summary.evaluationCredits > 0) return summary

  throw new ApiError(402, 'Buy an evaluation or subscription before generating this report')
}

function normalizeEntitlementOwner(owner: string | EntitlementOwner): EntitlementOwner {
  return typeof owner === 'string' ? { mobileInstallId: owner } : owner
}

function getOwnerWhere(owner: EntitlementOwner) {
  const filters = [
    eq(schema.paymentEntitlements.mobileInstallId, owner.mobileInstallId),
    owner.userId ? eq(schema.paymentEntitlements.userId, owner.userId) : null,
    owner.anonymousActorId ? eq(schema.paymentEntitlements.anonymousActorId, owner.anonymousActorId) : null,
  ].filter((filter) => filter !== null)

  return filters.length === 1 ? filters[0] : or(...filters)
}

async function getRevenueCatSubscription(owner: EntitlementOwner) {
  const revenueCatAppUserId = owner.revenueCatAppUserId || owner.mobileInstallId
  if (revenueCatAppUserId !== owner.mobileInstallId) return null
  return verifyRevenueCatPro(revenueCatAppUserId)
}

function readPaymentProduct(value: unknown): PaymentProduct {
  if (typeof value === 'string' && paymentProductSchemaValues.includes(value as PaymentProduct)) {
    return value as PaymentProduct
  }
  throw new ApiError(400, 'Unsupported checkout product')
}

function readStripeId(value: string | { id: string } | null) {
  if (!value) return null
  if (typeof value === 'string') return value
  return value.id
}

function readOptionalMetadata(value: string | null | undefined) {
  return value ? value : null
}

function readSubscriptionPeriodEnd(subscription: Stripe.Subscription | null) {
  const unixSeconds = subscription ? (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end : null
  return typeof unixSeconds === 'number' ? new Date(unixSeconds * 1000) : null
}

function readPotentialImageExtras(metadata: Record<string, unknown>) {
  const extras = metadata.extras
  if (!extras || typeof extras !== 'object') return 0
  const potentialImages = (extras as Record<string, unknown>).potentialImages
  return typeof potentialImages === 'number' && Number.isFinite(potentialImages) ? potentialImages : 0
}

function isProAccessProduct(product: PaymentProduct) {
  return product.startsWith('mobile_subscription') || product === 'mobile_lifetime'
}
