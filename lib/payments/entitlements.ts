import { randomInt, createHmac } from 'crypto'
import { and, eq, gt, isNull, inArray, sql, or, lt, gte, count } from 'drizzle-orm'
import Stripe from 'stripe'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { fetchRevenueCatSubscriber, readRevenueCatPro, readRevenueCatScanPurchases, readRevenueCatScanSubscription, type RevenueCatSubscriber } from '@/lib/payments/revenuecat'
import { addCalendarMonths, scanPeriod } from './scan-periods'
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
  mobileInstallId?: string
  userId?: string | null
  anonymousActorId?: string | null
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
  if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
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
  const paymentIntent = typeof session.payment_intent === 'string'
    ? await getStripe().paymentIntents.retrieve(session.payment_intent, { expand: ['latest_charge'] })
    : session.payment_intent
  const charge = paymentIntent?.latest_charge && typeof paymentIntent.latest_charge !== 'string' ? paymentIntent.latest_charge : null
  const revoked = charge?.refunded || charge?.disputed
  const purchasedAt = new Date((charge?.created ?? session.created) * 1000)
  const credits = revoked || product === 'extra_potential_image' ? 0 : getProductConfig(product).credits
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
      subscriptionStatus: revoked ? (charge?.disputed ? 'disputed' : 'refunded') : subscriptionStatus,
      currentPeriodEnd,
      currentPeriodStart: readSubscriptionPeriodStart(subscription),
      creditExpiresAt: credits > 0 ? addCalendarMonths(purchasedAt, 6) : null,
      createdAt: purchasedAt,
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
          potentialImages: revoked ? 0 : extras,
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
  const interval = subscription.items?.data[0]?.price.recurring?.interval
  const product = interval && ['week', 'month', 'year'].includes(interval)
    ? ({ week: 'mobile_subscription_weekly', month: 'mobile_subscription_monthly', year: 'mobile_subscription_yearly' } as const)[interval as 'week' | 'month' | 'year']
    : undefined
  await db
    .update(schema.paymentEntitlements)
    .set({
      ...(product ? { product } : {}),
      subscriptionStatus: subscription.status,
      currentPeriodEnd: readSubscriptionPeriodEnd(subscription),
      currentPeriodStart: readSubscriptionPeriodStart(subscription),
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

type EntitlementRow = typeof schema.paymentEntitlements.$inferSelect
export type PaymentTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
const reservationTimeoutMs = 5 * 60 * 1000

function activePro(row: EntitlementRow, now: Date) {
  if (!isProAccessProduct(row.product)) return false
  if (!row.subscriptionStatus || !['active', 'trialing', 'complete'].includes(row.subscriptionStatus)) return false
  return row.product === 'mobile_lifetime' || Boolean(row.currentPeriodEnd && row.currentPeriodEnd > now)
}

async function loadScanAccess(owner: EntitlementOwner, verifiedSubscriber?: RevenueCatSubscriber | null) {
  if (!owner.userId) throw new ApiError(401, 'An account is required')
  await releaseAbandonedEvaluations(owner.userId)
  const subscriber = verifiedSubscriber !== undefined ? verifiedSubscriber : await fetchRevenueCatSubscriber(owner.userId)
  if (subscriber) await creditRevenueCatScans(owner.userId, owner.mobileInstallId, subscriber)
  let rows = await db.query.paymentEntitlements.findMany({ where: getOwnerWhere(owner) })
  // Reconcile provider state, including pre-migration rows and missed webhooks.
  const stripeIds = [...new Set(rows.flatMap(row => row.stripeSubscriptionId ? [row.stripeSubscriptionId] : []))]
  for (const id of stripeIds) await updateSubscriptionEntitlement(await getStripe().subscriptions.retrieve(id))
  if (stripeIds.length) rows = await db.query.paymentEntitlements.findMany({ where: getOwnerWhere(owner) })
  const now = new Date()
  const active = rows.filter(row => activePro(row, now))
  const allowanceKeys: string[] = []
  const grant = async (key: string, plan: 'weekly' | 'monthly' | 'yearly', start: Date, end: Date) => {
    const period = scanPeriod(plan, start, end, now)
    if (!period) return
    const periodKey = `${key}:scans:${period.start.toISOString()}`
    const existing = await db.query.paymentEntitlements.findFirst({ where: eq(schema.paymentEntitlements.stripeCheckoutSessionId, periodKey), columns: { id: true } })
    if (existing) { allowanceKeys.push(periodKey); return }
    const [legacy] = await db.select({ used: count() }).from(schema.analyses)
      .innerJoin(schema.photos, eq(schema.photos.id, schema.analyses.photoId))
      .innerJoin(schema.users, eq(schema.users.id, schema.photos.userId))
      .where(and(eq(schema.users.id, owner.userId!), eq(schema.analyses.status, 'complete'),
        gte(schema.analyses.createdAt, period.start), lt(schema.analyses.createdAt, period.end),
        lt(schema.analyses.createdAt, schema.users.scanCreditPolicyStartedAt)))
    await db.insert(schema.paymentEntitlements).values({
      userId: owner.userId,
      mobileInstallId: owner.mobileInstallId || `account_${owner.userId}`,
      stripeCheckoutSessionId: periodKey,
      product: 'evaluation',
      source: 'subscription_allowance',
      creditBalance: Math.max(0, period.credits - (legacy?.used || 0)),
      creditExpiresAt: period.end,
      currentPeriodStart: period.start,
    }).onConflictDoNothing({ target: schema.paymentEntitlements.stripeCheckoutSessionId })
    allowanceKeys.push(periodKey)
  }
  for (const row of active) {
    if (row.product === 'mobile_lifetime') continue
    if (!row.currentPeriodStart || !row.currentPeriodEnd) continue
    await grant(row.stripeSubscriptionId || row.id, row.product.replace('mobile_subscription_', '') as 'weekly' | 'monthly' | 'yearly', row.currentPeriodStart, row.currentPeriodEnd)
  }
  const rc = readRevenueCatScanSubscription(subscriber)
  if (rc) {
    // Bind the paid billing transaction once, across aliases and all annual months.
    await db.insert(schema.paymentEntitlements).values({
      userId: owner.userId, mobileInstallId: owner.mobileInstallId || `account_${owner.userId}`,
      stripeCheckoutSessionId: rc.key, product: `mobile_subscription_${rc.plan}`,
      source: 'revenuecat_subscription', creditBalance: 0,
      currentPeriodStart: rc.start, currentPeriodEnd: rc.end,
    }).onConflictDoNothing({ target: schema.paymentEntitlements.stripeCheckoutSessionId })
    const ownerRow = await db.query.paymentEntitlements.findFirst({ where: eq(schema.paymentEntitlements.stripeCheckoutSessionId, rc.key) })
    if (ownerRow?.userId === owner.userId) await grant(rc.key, rc.plan, rc.start, rc.end)
  }
  rows = await db.query.paymentEntitlements.findMany({ where: getOwnerWhere(owner) })
  const spendable = rows.filter(row =>
    ['evaluation', 'evaluation_pack_3'].includes(row.product) && row.creditBalance > 0
    && !['refunded', 'disputed'].includes(row.subscriptionStatus || '')
    && (!row.creditExpiresAt || row.creditExpiresAt > now)
    && (row.source !== 'subscription_allowance' || allowanceKeys.includes(row.stripeCheckoutSessionId))
  )
  const latest = active.sort((a, b) => (b.currentPeriodEnd?.getTime() || 0) - (a.currentPeriodEnd?.getTime() || 0))[0]
  const pro = readRevenueCatPro(subscriber)
  const lifetime = active.find(row => row.product === 'mobile_lifetime' || ['admin_invite_code', 'admin_referral_code'].includes(row.source || ''))
  const summary: EntitlementSummary = {
    mobileInstallId: owner.mobileInstallId || `account_${owner.userId}`,
    evaluationCredits: lifetime ? Number.MAX_SAFE_INTEGER : spendable.reduce((sum, row) => sum + row.creditBalance, 0),
    extras: { potentialImages: rows.filter(row => row.product === 'extra_potential_image' && !['refunded', 'disputed'].includes(row.subscriptionStatus || '')).reduce((sum, row) => sum + readPotentialImageExtras(row.metadata), 0) },
    subscription: {
      active: Boolean(latest || pro?.active),
      status: latest?.subscriptionStatus ?? pro?.status ?? null,
      currentPeriodEnd: latest?.currentPeriodEnd?.toISOString() ?? pro?.currentPeriodEnd?.toISOString() ?? null,
    },
  }
  return { summary, spendable, lifetime }
}

export async function getEntitlementSummary(ownerInput: string | EntitlementOwner, verifiedSubscriber?: RevenueCatSubscriber | null): Promise<EntitlementSummary> {
  return (await loadScanAccess(normalizeEntitlementOwner(ownerInput), verifiedSubscriber)).summary
}

// Reserve before any model work or report persistence. The row lock also protects
// against two devices spending the last credit simultaneously.
export async function reserveEvaluation(ownerInput: EntitlementOwner, requestId: string, requestHash: string) {
  const owner = normalizeEntitlementOwner(ownerInput)
  if (!owner.userId) throw new ApiError(401, 'An account is required')
  const id = `${owner.userId}:${requestId}`
  const access = await loadScanAccess(owner)
  return db.transaction(async tx => {
    // Serialize identical request IDs even when the account has several packs.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`)
    const prior = await tx.query.scanReservations.findFirst({ where: eq(schema.scanReservations.id, id) })
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ApiError(409, 'This scan request ID was already used for another photo')
      if (prior.status === 'pending') throw new ApiError(409, 'Your scan is still processing. Please retry shortly.')
      return { id, result: prior.result, summary: access.summary }
    }
    let entitlementId = access.lifetime?.id
    if (!entitlementId) {
      const ids = access.spendable.map(row => row.id)
      if (!ids.length) throw new ApiError(402, 'No scans available. Buy more scans or wait for your next allowance.')
      const [pack] = await tx.select().from(schema.paymentEntitlements)
        .where(and(inArray(schema.paymentEntitlements.id, ids), getOwnerWhere(owner), gt(schema.paymentEntitlements.creditBalance, 0),
          or(isNull(schema.paymentEntitlements.creditExpiresAt), gt(schema.paymentEntitlements.creditExpiresAt, new Date()))))
        .orderBy(sql`case when ${schema.paymentEntitlements.source} = 'subscription_allowance' then 0 else 1 end`, schema.paymentEntitlements.creditExpiresAt, schema.paymentEntitlements.createdAt)
        .limit(1).for('update')
      if (!pack) throw new ApiError(402, 'No scans available. Buy more scans or wait for your next allowance.')
      await tx.update(schema.paymentEntitlements).set({ creditBalance: sql`${schema.paymentEntitlements.creditBalance} - 1`, updatedAt: new Date() }).where(eq(schema.paymentEntitlements.id, pack.id))
      entitlementId = pack.id
    }
    await tx.insert(schema.scanReservations).values({ id, userId: owner.userId!, entitlementId, requestHash, createdAt: new Date() })
    return { id, result: null, summary: { ...access.summary, evaluationCredits: access.lifetime ? access.summary.evaluationCredits : Math.max(0, access.summary.evaluationCredits - 1) } }
  })
}

export async function finishEvaluation(id: string, result: Record<string, unknown>, successful: boolean, transaction?: PaymentTransaction) {
  const settle = async (tx: PaymentTransaction) => {
    if (successful) {
      const [current] = await tx.select().from(schema.scanReservations).where(eq(schema.scanReservations.id, id)).for('update')
      if (!current || current.status === 'failed') throw new ApiError(409, 'This scan request expired. Please retry.')
      if (current.status === 'complete') {
        await tx.update(schema.scanReservations).set({ result }).where(eq(schema.scanReservations.id, id))
        return
      }
      await lockEvaluationReservation(tx, id)
    }
    const [reservation] = await tx.update(schema.scanReservations)
      .set({ result, status: successful ? 'complete' : 'failed' })
      .where(and(eq(schema.scanReservations.id, id), eq(schema.scanReservations.status, 'pending'))).returning()
    if (!reservation || successful) return
    await returnReservedCredit(tx, reservation.entitlementId)
  }
  if (transaction) await settle(transaction)
  else await db.transaction(settle)
}

async function returnReservedCredit(tx: PaymentTransaction, entitlementId: string) {
  // Keep the original expiry and never resurrect refunded purchases.
  await tx.update(schema.paymentEntitlements)
    .set({ creditBalance: sql`${schema.paymentEntitlements.creditBalance} + 1`, updatedAt: new Date() })
    .where(and(eq(schema.paymentEntitlements.id, entitlementId),
      inArray(schema.paymentEntitlements.product, ['evaluation', 'evaluation_pack_3']),
      sql`coalesce(${schema.paymentEntitlements.subscriptionStatus}, '') not in ('refunded', 'disputed')`))
}

async function releaseAbandonedEvaluations(userId: string) {
  await db.transaction(async tx => {
    const abandoned = await tx.update(schema.scanReservations)
      .set({ status: 'failed', result: { analysis: { status: 'failed', failureReason: 'Scan timed out. Your scan was returned; please retry.' } } })
      .where(and(eq(schema.scanReservations.userId, userId), eq(schema.scanReservations.status, 'pending'),
        lt(schema.scanReservations.createdAt, new Date(Date.now() - reservationTimeoutMs))))
      .returning({ entitlementId: schema.scanReservations.entitlementId })
    for (const row of abandoned) await returnReservedCredit(tx, row.entitlementId)
  })
}

// Lock before saving the analysis, in the same transaction as its debit commit.
// An abandoned request can never publish a late report after its credit is returned.
export async function lockEvaluationReservation(tx: PaymentTransaction, id: string) {
  const [row] = await tx.select().from(schema.scanReservations).where(eq(schema.scanReservations.id, id)).for('update')
  if (!row || row.status !== 'pending' || row.createdAt.getTime() <= Date.now() - reservationTimeoutMs) {
    throw new ApiError(409, 'This scan request expired. Please retry.')
  }
}

export async function consumeEvaluationEntitlement(ownerInput: string | EntitlementOwner) {
  const reservation = await reserveEvaluation(normalizeEntitlementOwner(ownerInput), crypto.randomUUID(), 'direct')
  await finishEvaluation(reservation.id, {}, true)
  return reservation.summary
}

export async function assertEvaluationEntitlement(ownerInput: string | EntitlementOwner) {
  const summary = await getEntitlementSummary(ownerInput)
  if (summary.evaluationCredits > 0) return summary
  throw new ApiError(402, 'No scans available. Buy more scans or wait for your next allowance.')
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
  const seconds = subscription?.items?.data[0]?.current_period_end
    ?? (subscription as (Stripe.Subscription & { current_period_end?: number }) | null)?.current_period_end
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
}

function readSubscriptionPeriodStart(subscription: Stripe.Subscription | null) {
  const seconds = subscription?.items?.data[0]?.current_period_start
    ?? (subscription as (Stripe.Subscription & { current_period_start?: number }) | null)?.current_period_start
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null
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

// Called only with a server-fetched subscriber, never client-supplied receipts or balances.
export async function creditRevenueCatScans(userId: string, mobileInstallId: string | undefined, subscriber: RevenueCatSubscriber) {
  for (const purchase of readRevenueCatScanPurchases(subscriber)) {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rc-purchase:${purchase.transactionId}`}, 0))`)
      const reversal = await tx.query.paymentEntitlements.findFirst({
        where: eq(schema.paymentEntitlements.stripeCheckoutSessionId, `revenuecat-refund:${purchase.transactionId}`),
        columns: { id: true },
      })
      const refunded = purchase.refunded || Boolean(reversal)
      if (purchase.purchasedAt) {
        await tx.insert(schema.paymentEntitlements).values({
          userId,
          mobileInstallId: mobileInstallId || `account_${userId}`,
          stripeCheckoutSessionId: purchase.key,
          product: purchase.product,
          creditBalance: refunded ? 0 : purchase.credits,
          source: 'revenuecat',
          createdAt: purchase.purchasedAt,
          creditExpiresAt: addCalendarMonths(purchase.purchasedAt, 6),
          subscriptionStatus: refunded ? 'refunded' : null,
          metadata: { transactionId: purchase.transactionId, productId: purchase.productId, sandbox: purchase.sandbox },
        }).onConflictDoNothing({ target: schema.paymentEntitlements.stripeCheckoutSessionId })
        // Repair historical expiry dates, never reset balances or ownership.
        await tx.update(schema.paymentEntitlements).set({ creditExpiresAt: addCalendarMonths(purchase.purchasedAt, 6) })
          .where(eq(schema.paymentEntitlements.stripeCheckoutSessionId, purchase.key))
      }
      if (refunded) await tx.update(schema.paymentEntitlements)
        .set({ creditBalance: 0, subscriptionStatus: 'refunded', updatedAt: new Date() })
        .where(eq(schema.paymentEntitlements.stripeCheckoutSessionId, purchase.key))
    })
  }
}

// The tombstone also covers a refund delivered before its original purchase sync.
export async function revokeRevenueCatPurchase(transactionId: string) {
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`rc-purchase:${transactionId}`}, 0))`)
    await tx.insert(schema.paymentEntitlements).values({
      mobileInstallId: 'revoked', stripeCheckoutSessionId: `revenuecat-refund:${transactionId}`,
      product: 'evaluation', source: 'revenuecat_refund', creditBalance: 0, subscriptionStatus: 'refunded',
    }).onConflictDoNothing({ target: schema.paymentEntitlements.stripeCheckoutSessionId })
    await tx.update(schema.paymentEntitlements)
      .set({ creditBalance: 0, subscriptionStatus: 'refunded', updatedAt: new Date() })
      .where(sql`${schema.paymentEntitlements.source} = 'revenuecat' and ${schema.paymentEntitlements.metadata}->>'transactionId' = ${transactionId}`)
  })
}

export async function syncRevenueCatScans(userId: string, mobileInstallId?: string) {
  const subscriber = await fetchRevenueCatSubscriber(userId, true)
  if (!subscriber) throw new ApiError(503, 'Unable to verify purchases.')
  await creditRevenueCatScans(userId, mobileInstallId, subscriber)
  return subscriber
}
