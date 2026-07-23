import { randomInt, createHmac } from 'crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import Stripe from 'stripe'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { verifyRevenueCatPro } from '@/lib/payments/revenuecat'
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
  mobileInstallId?: string
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

export function generatePaymentActivationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export async function grantEntitlementFromCheckoutSession({
  session,
}: {
  session: Stripe.Checkout.Session
}) {
  if (session.payment_status !== 'paid' && session.status !== 'complete') {
    throw new ApiError(402, 'Checkout has not completed')
  }

  const product = readPaymentProduct(session.metadata?.product)
  const accountId = readOptionalMetadata(session.metadata?.accountId || session.metadata?.userId)
  if (!accountId) throw new ApiError(400, 'Checkout is missing account id')
  const metadataInstallId = readOptionalMetadata(session.metadata?.mobileInstallId)
  const mobileInstallId = metadataInstallId || `account_${accountId}`

  const subscription = typeof session.subscription === 'object' && session.subscription
    ? session.subscription
    : null
  const subscriptionStatus = subscription?.status ?? (isProAccessProduct(product) ? 'active' : null)
  const currentPeriodEnd = readSubscriptionPeriodEnd(subscription)
  const credits = product === 'extra_potential_image' ? 0 : getProductConfig(product).credits
  const extras = product === 'extra_potential_image' ? 1 : 0
  const activationCode = readActivationCode(session.metadata?.activationCode)
  const activationCodeHash = activationCode ? hashPaymentActivationCode(activationCode) : null

  await db
    .insert(schema.paymentEntitlements)
    .values({
      mobileInstallId,
      userId: accountId,
      anonymousActorId: null,
      stripeCheckoutSessionId: session.id,
      stripeCustomerId: readStripeId(session.customer),
      stripeSubscriptionId: readStripeId(session.subscription),
      stripePaymentIntentId: readStripeId(session.payment_intent),
      product,
      creditBalance: credits,
      subscriptionStatus,
      currentPeriodEnd,
      activationCodeHash,
      activationCodeLast4: activationCode ? activationCode.slice(-4) : null,
      activationCodeRedeemedAt: null,
      source: session.metadata?.source ?? null,
      metadata: {
        checkoutMode: session.mode,
        stripePaymentStatus: session.payment_status,
        originalMobileInstallId: metadataInstallId ?? null,
        accountId,
        extras: {
          potentialImages: extras,
        },
      },
    })
    .onConflictDoNothing({
      target: schema.paymentEntitlements.stripeCheckoutSessionId,
    })

}

export async function redeemPaymentActivationCode({
  code,
  mobileInstallId,
  userId,
}: {
  code: string
  mobileInstallId: string
  userId: string
}) {
  const normalizedCode = normalizeActivationCode(code)
  const codeHash = hashPaymentActivationCode(normalizedCode)
  await db.transaction(async (tx) => {
    const entitlement = await tx.query.paymentEntitlements.findFirst({
      where: and(
        eq(schema.paymentEntitlements.activationCodeHash, codeHash),
        eq(schema.paymentEntitlements.userId, userId)
      ),
    })
    if (!entitlement) throw new ApiError(404, 'Activation code not found for this account')
    if (entitlement.activationCodeRedeemedAt) throw new ApiError(409, 'This activation code has already been used')
    if (!isRedeemableEntitlement(entitlement)) throw new ApiError(402, 'This activation code no longer has active access')

    const [claimed] = await tx
      .update(schema.paymentEntitlements)
      .set({ mobileInstallId, activationCodeRedeemedAt: new Date(), updatedAt: new Date() })
      .where(and(
        eq(schema.paymentEntitlements.id, entitlement.id),
        eq(schema.paymentEntitlements.userId, userId),
        isNull(schema.paymentEntitlements.activationCodeRedeemedAt)
      ))
      .returning({ id: schema.paymentEntitlements.id })
    if (!claimed) throw new ApiError(409, 'This activation code has already been used')
  })

  return getEntitlementSummary({ mobileInstallId, userId })
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
    mobileInstallId: owner.mobileInstallId || (owner.userId ? `account_${owner.userId}` : 'account'),
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
  if (owner.userId) return eq(schema.paymentEntitlements.userId, owner.userId)
  if (owner.mobileInstallId) return eq(schema.paymentEntitlements.mobileInstallId, owner.mobileInstallId)
  if (owner.anonymousActorId) return eq(schema.paymentEntitlements.anonymousActorId, owner.anonymousActorId)
  throw new ApiError(401, 'An account is required')
}

async function getRevenueCatSubscription(owner: EntitlementOwner) {
  const revenueCatAppUserId = owner.revenueCatAppUserId || owner.userId || owner.mobileInstallId
  if (!revenueCatAppUserId) return null
  return verifyRevenueCatPro(revenueCatAppUserId)
}

function readPaymentProduct(value: unknown): PaymentProduct {
  if (typeof value === 'string' && paymentProductSchemaValues.includes(value as PaymentProduct)) {
    return value as PaymentProduct
  }
  throw new ApiError(400, 'Unsupported checkout product')
}

function readActivationCode(value: unknown) {
  if (typeof value !== 'string') return null
  const digits = value.replace(/\D/g, '')
  return /^\d{6}$/.test(digits) ? digits : null
}

function normalizeActivationCode(value: string) {
  const digits = value.replace(/\D/g, '')
  if (!/^\d{6}$/.test(digits)) {
    throw new ApiError(400, 'Activation code must be six digits')
  }
  return digits
}

function hashPaymentActivationCode(code: string) {
  return createHmac('sha256', getActivationCodeSecret())
    .update(`payment-activation:${normalizeActivationCode(code)}`)
    .digest('hex')
}

function getActivationCodeSecret() {
  return env.NEXTAUTH_SECRET || env.STRIPE_WEBHOOK_SECRET || env.DATABASE_URL
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

export function isRedeemableEntitlement(row: typeof schema.paymentEntitlements.$inferSelect) {
  if (row.creditBalance > 0) return true
  if (row.product === 'extra_potential_image' && readPotentialImageExtras(row.metadata) > 0) return true
  if (!isProAccessProduct(row.product)) return false
  if (row.subscriptionStatus && !['active', 'trialing', 'complete'].includes(row.subscriptionStatus)) return false
  if (row.product === 'mobile_lifetime') return true
  return !row.currentPeriodEnd || row.currentPeriodEnd.getTime() > Date.now()
}

function isProAccessProduct(product: PaymentProduct) {
  return product.startsWith('mobile_subscription') || product === 'mobile_lifetime'
}
