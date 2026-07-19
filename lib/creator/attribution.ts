import { createHmac, timingSafeEqual } from 'crypto'
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'
import type { NextApiRequest, NextApiResponse } from 'next'
import type Stripe from 'stripe'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'

export const CREATOR_ATTRIBUTION_COOKIE = 'mogging_creator_attribution'
export const CREATOR_LINK_BASE_URL = 'https://www.mogging.com'
export const CREATOR_APP_DEEP_LINK = 'mogging://r'
const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30
const DEFAULT_IOS_APP_STORE_URL = 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050'

type AttributionOwner = {
  userId?: string | null
  anonymousActorId?: string | null
  mobileInstallId?: string | null
}

export type CreatorAttributionContext = AttributionOwner & {
  token: string
  clickId: string
  trackingLinkId: string
  firstClickId: string
  firstTrackingLinkId: string
  attributionKey: string
}

export type PublicCreatorAttributionContext = Pick<CreatorAttributionContext,
  'clickId' | 'trackingLinkId' | 'firstClickId' | 'firstTrackingLinkId' | 'attributionKey'>

export async function ensureCreatorTrackingLink(socialAccountId: string) {
  const existing = await db.query.creatorTrackingLinks.findFirst({
    where: eq(schema.creatorTrackingLinks.socialAccountId, socialAccountId),
  })
  if (existing) {
    const publicUrl = `${CREATOR_LINK_BASE_URL}/r/${existing.slug}`
    if (!existing.isActive || existing.publicUrl !== publicUrl || existing.deepLinkBaseUrl !== CREATOR_APP_DEEP_LINK) {
      const [updated] = await db.update(schema.creatorTrackingLinks).set({
        isActive: true,
        publicUrl,
        deepLinkBaseUrl: CREATOR_APP_DEEP_LINK,
        updatedAt: new Date(),
      }).where(eq(schema.creatorTrackingLinks.id, existing.id)).returning()
      return updated
    }
    return existing
  }

  const account = await db.query.creatorSocialAccounts.findFirst({
    where: eq(schema.creatorSocialAccounts.id, socialAccountId),
  })
  if (!account) throw new Error('Creator social account not found')

  const safeHandle = account.handle.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const slug = `${account.platform}-${safeHandle}-${account.id.slice(0, 8)}`
  const iosAppStoreUrl = buildIosAppStoreUrl(slug)
  const [link] = await db.insert(schema.creatorTrackingLinks).values({
    socialAccountId,
    slug,
    publicUrl: `${CREATOR_LINK_BASE_URL}/r/${slug}`,
    deepLinkBaseUrl: CREATOR_APP_DEEP_LINK,
    iosAppStoreUrl,
    androidAppStoreUrl: env.NEXT_PUBLIC_ANDROID_APP_STORE_URL || null,
  }).onConflictDoUpdate({
    target: schema.creatorTrackingLinks.socialAccountId,
    set: { isActive: true, publicUrl: `${CREATOR_LINK_BASE_URL}/r/${slug}`, deepLinkBaseUrl: CREATOR_APP_DEEP_LINK, updatedAt: new Date() },
  }).returning()
  return link
}

export async function setCreatorTrackingLinkActive(socialAccountId: string, isActive: boolean) {
  await db.update(schema.creatorTrackingLinks).set({ isActive, updatedAt: new Date() }).where(eq(schema.creatorTrackingLinks.socialAccountId, socialAccountId))
}

export async function createCreatorAttributionClick(input: {
  slug: string
  anonymousActorId: string | null
  referrer?: string | null
  userAgent?: string | null
}) {
  const link = await db.query.creatorTrackingLinks.findFirst({
    where: and(eq(schema.creatorTrackingLinks.slug, input.slug), eq(schema.creatorTrackingLinks.isActive, true)),
  })
  if (!link) return null
  const isBot = isLinkPreviewOrBot(input.userAgent || '')
  const [click] = await db.insert(schema.creatorAttributionClicks).values({
    trackingLinkId: link.id,
    anonymousActorId: input.anonymousActorId,
    referrer: input.referrer?.slice(0, 2000) || null,
    userAgent: input.userAgent?.slice(0, 1000) || null,
    isBot,
  }).returning()
  const token = signClickId(click.id)
  return {
    link,
    click,
    token,
    deepLinkUrl: buildDeferredDeepLinkUrl(link, token),
    isBot,
  }
}

export function setCreatorAttributionCookie(res: NextApiResponse, token: string) {
  appendSetCookie(res, [
    `${CREATOR_ATTRIBUTION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${ATTRIBUTION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean).join('; '))
}

export function readCreatorAttributionToken(req: Pick<NextApiRequest, 'headers'>, explicitToken?: string | null) {
  if (explicitToken) return explicitToken
  return readCookie(req.headers.cookie || '', CREATOR_ATTRIBUTION_COOKIE)
}

export async function resolveCreatorAttribution(input: {
  req?: Pick<NextApiRequest, 'headers'>
  token?: string | null
  owner?: AttributionOwner
}): Promise<CreatorAttributionContext | null> {
  const token = input.token || (input.req ? readCreatorAttributionToken(input.req) : null)
  const clickId = token ? verifyClickToken(token) : null
  if (!token || !clickId) return null
  const click = await db.query.creatorAttributionClicks.findFirst({
    where: eq(schema.creatorAttributionClicks.id, clickId),
    with: { trackingLink: true },
  })
  if (!click || click.isBot || !click.trackingLink?.isActive) return null
  if (click.createdAt.getTime() < Date.now() - ATTRIBUTION_MAX_AGE_SECONDS * 1000) return null
  const owner = input.owner || {}
  const firstClick = click.anonymousActorId ? await db.query.creatorAttributionClicks.findFirst({
    where: and(
      eq(schema.creatorAttributionClicks.anonymousActorId, click.anonymousActorId),
      eq(schema.creatorAttributionClicks.isBot, false),
      gte(schema.creatorAttributionClicks.createdAt, new Date(Date.now() - ATTRIBUTION_MAX_AGE_SECONDS * 1000))
    ),
    orderBy: [asc(schema.creatorAttributionClicks.createdAt)],
  }) : null
  return {
    token,
    clickId: click.id,
    trackingLinkId: click.trackingLinkId,
    firstClickId: firstClick?.id || click.id,
    firstTrackingLinkId: firstClick?.trackingLinkId || click.trackingLinkId,
    userId: owner.userId || null,
    anonymousActorId: owner.anonymousActorId || click.anonymousActorId,
    mobileInstallId: owner.mobileInstallId || null,
    attributionKey: getAttributionKey(owner, click.anonymousActorId, click.id),
  }
}

export function stripeAttributionMetadata(context: CreatorAttributionContext | null): Record<string, string> {
  if (!context) return {}
  return {
    creatorTrackingLinkId: context.trackingLinkId,
    creatorClickId: context.clickId,
    creatorAttributionKey: context.attributionKey,
    creatorFirstTrackingLinkId: context.firstTrackingLinkId,
    creatorFirstClickId: context.firstClickId,
  }
}

export async function recordCreatorSignup(input: { req: Pick<NextApiRequest, 'headers'>; userId: string }) {
  const context = await resolveCreatorAttribution({ req: input.req, owner: { userId: input.userId } })
  if (!context) return null
  const [user, click] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, input.userId), columns: { createdAt: true } }),
    db.query.creatorAttributionClicks.findFirst({ where: eq(schema.creatorAttributionClicks.id, context.clickId), columns: { createdAt: true } }),
  ])
  if (!user || !click || user.createdAt.getTime() < click.createdAt.getTime() - 60_000) return null
  return insertAttributionEvent({ ...context, eventType: 'signup', dedupeKey: `creator-signup:${input.userId}` })
}

export async function recordCreatorInstall(input: { token: string; mobileInstallId: string; userId?: string | null }) {
  const context = await resolveMobileCreatorAttribution(input)
  if (!context) return null
  const event = await insertAttributionEvent({ ...context, eventType: 'install', dedupeKey: `creator-install:${input.mobileInstallId}` })
  return { created: Boolean(event), event, context: publicCreatorAttributionContext(context) }
}

export async function resolveMobileCreatorAttribution(input: { token: string; mobileInstallId: string; userId?: string | null }) {
  const direct = await resolveCreatorAttribution({
    token: input.token,
    owner: { mobileInstallId: input.mobileInstallId, userId: input.userId },
  })
  if (!direct) return null

  const firstTouch = await db.query.mobileCreatorAttributions.findFirst({
    where: eq(schema.mobileCreatorAttributions.mobileInstallId, input.mobileInstallId),
    orderBy: [asc(schema.mobileCreatorAttributions.createdAt)],
  })
  const context: CreatorAttributionContext = {
    ...direct,
    firstClickId: firstTouch?.firstClickId || direct.firstClickId,
    firstTrackingLinkId: firstTouch?.firstTrackingLinkId || direct.firstTrackingLinkId,
    attributionKey: firstTouch?.attributionKey || `install:${input.mobileInstallId}`,
  }

  await db.insert(schema.mobileCreatorAttributions).values({
    mobileInstallId: input.mobileInstallId,
    trackingLinkId: context.trackingLinkId,
    clickId: context.clickId,
    firstTrackingLinkId: context.firstTrackingLinkId,
    firstClickId: context.firstClickId,
    attributionKey: context.attributionKey,
    userId: input.userId || null,
  }).onConflictDoUpdate({
    target: [schema.mobileCreatorAttributions.mobileInstallId, schema.mobileCreatorAttributions.clickId],
    set: {
      userId: input.userId || firstTouch?.userId || null,
      updatedAt: new Date(),
    },
  })

  return context
}

export async function getStoredMobileCreatorAttribution(input: { mobileInstallId: string; userId?: string | null; anonymousActorId?: string | null }) {
  const touch = await db.query.mobileCreatorAttributions.findFirst({
    where: eq(schema.mobileCreatorAttributions.mobileInstallId, input.mobileInstallId),
    orderBy: [desc(schema.mobileCreatorAttributions.updatedAt)],
  })
  if (!touch) return null
  return {
    token: '',
    clickId: touch.clickId,
    trackingLinkId: touch.trackingLinkId,
    firstClickId: touch.firstClickId,
    firstTrackingLinkId: touch.firstTrackingLinkId,
    attributionKey: touch.attributionKey,
    mobileInstallId: touch.mobileInstallId,
    userId: input.userId || touch.userId,
    anonymousActorId: input.anonymousActorId || null,
  } satisfies CreatorAttributionContext
}

export async function associateMobileCreatorAttribution(input: { token: string; mobileInstallId: string; userId: string }) {
  const context = await resolveMobileCreatorAttribution(input)
  if (!context) return null

  await db.update(schema.mobileCreatorAttributions)
    .set({ userId: input.userId, updatedAt: new Date() })
    .where(eq(schema.mobileCreatorAttributions.mobileInstallId, input.mobileInstallId))
  await db.update(schema.creatorAttributionEvents)
    .set({ userId: input.userId })
    .where(and(
      eq(schema.creatorAttributionEvents.dedupeKey, `creator-install:${input.mobileInstallId}`),
      sql`${schema.creatorAttributionEvents.userId} is null`
    ))

  const [user, firstClick] = await Promise.all([
    db.query.users.findFirst({ where: eq(schema.users.id, input.userId), columns: { createdAt: true } }),
    db.query.creatorAttributionClicks.findFirst({ where: eq(schema.creatorAttributionClicks.id, context.firstClickId), columns: { createdAt: true } }),
  ])
  if (user && firstClick && user.createdAt.getTime() >= firstClick.createdAt.getTime() - 60_000) {
    await insertAttributionEvent({
      ...context,
      userId: input.userId,
      mobileInstallId: input.mobileInstallId,
      eventType: 'signup',
      dedupeKey: `creator-signup:${input.userId}`,
    })
  }
  return publicCreatorAttributionContext(context)
}

export type RevenueCatCreatorEvent = {
  id: string
  type: string
  appUserId: string
  originalAppUserId?: string | null
  aliases?: string[]
  transactionId?: string | null
  originalTransactionId?: string | null
  productId?: string | null
  price?: number | null
  currency?: string | null
  environment?: string | null
  store?: string | null
  cancelReason?: string | null
  expirationReason?: string | null
  purchasedAtMs?: number | null
  expirationAtMs?: number | null
  gracePeriodExpirationAtMs?: number | null
  subscriberAttributes?: Record<string, { value?: unknown }>
}

type RevenueCatAttributionEventMapping = {
  eventType: 'payment' | 'refund' | 'subscription_cancellation' | 'subscription_expiration' | 'subscription_billing_issue' | 'subscription_reactivation'
  dedupeCategory: 'payment' | 'refund' | 'lifecycle'
  amountMultiplier: -1 | 0 | 1
}

export function mapRevenueCatAttributionEvent(type: string): RevenueCatAttributionEventMapping | null {
  if (['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'REFUND_REVERSED'].includes(type)) {
    return { eventType: 'payment', dedupeCategory: 'payment', amountMultiplier: 1 }
  }
  if (type === 'REFUND') return { eventType: 'refund', dedupeCategory: 'refund', amountMultiplier: -1 }
  if (type === 'CANCELLATION') return { eventType: 'subscription_cancellation', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  if (type === 'EXPIRATION') return { eventType: 'subscription_expiration', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  if (type === 'BILLING_ISSUE') return { eventType: 'subscription_billing_issue', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  if (type === 'UNCANCELLATION') return { eventType: 'subscription_reactivation', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  return null
}

export async function recordRevenueCatCreatorEvent(event: RevenueCatCreatorEvent) {
  const candidates = Array.from(new Set([event.appUserId, event.originalAppUserId, ...(event.aliases || [])].filter(isString)))
  const attributeInstallId = readSubscriberAttribute(event.subscriberAttributes, 'mobile_install_id')
  if (attributeInstallId) candidates.push(attributeInstallId)
  if (candidates.length === 0) return null

  const attributeClickId = readSubscriberAttribute(event.subscriberAttributes, 'creator_click_id')
  const touch = await db.query.mobileCreatorAttributions.findFirst({
    where: attributeClickId
      ? and(inArray(schema.mobileCreatorAttributions.mobileInstallId, candidates), eq(schema.mobileCreatorAttributions.clickId, attributeClickId))
      : inArray(schema.mobileCreatorAttributions.mobileInstallId, candidates),
    orderBy: [desc(schema.mobileCreatorAttributions.updatedAt)],
  })
  if (!touch) return null

  const context: CreatorAttributionContext = {
    token: '',
    clickId: touch.clickId,
    trackingLinkId: touch.trackingLinkId,
    firstClickId: touch.firstClickId,
    firstTrackingLinkId: touch.firstTrackingLinkId,
    attributionKey: touch.attributionKey,
    mobileInstallId: touch.mobileInstallId,
    userId: touch.userId,
  }
  const amountCents = Math.max(0, Math.round((event.price || 0) * 100))
  const mapping = mapRevenueCatAttributionEvent(event.type)
  if (!mapping) return null
  const metadata = {
    provider: 'revenuecat',
    revenueCatEventType: event.type,
    productId: event.productId || null,
    transactionId: event.transactionId || null,
    originalTransactionId: event.originalTransactionId || null,
    environment: event.environment || null,
    store: event.store || null,
    cancelReason: event.cancelReason || null,
    expirationReason: event.expirationReason || null,
    purchasedAtMs: event.purchasedAtMs || null,
    expirationAtMs: event.expirationAtMs || null,
    gracePeriodExpirationAtMs: event.gracePeriodExpirationAtMs || null,
  }

  return insertAttributionEvent({
    ...context,
    eventType: mapping.eventType,
    dedupeKey: `creator-${mapping.dedupeCategory}:revenuecat:${event.id}`,
    amountCents: amountCents * mapping.amountMultiplier,
    currency: event.currency || 'USD',
    metadata,
  })
}

export function publicCreatorAttributionContext(context: CreatorAttributionContext): PublicCreatorAttributionContext {
  return {
    clickId: context.clickId,
    trackingLinkId: context.trackingLinkId,
    firstClickId: context.firstClickId,
    firstTrackingLinkId: context.firstTrackingLinkId,
    attributionKey: context.attributionKey,
  }
}

export async function recordCreatorCheckout(context: CreatorAttributionContext | null, session: Stripe.Checkout.Session) {
  if (!context) return null
  return insertAttributionEvent({
    ...context,
    eventType: 'checkout',
    dedupeKey: `creator-checkout:${session.id}`,
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: readStripeId(session.subscription),
    stripePaymentIntentId: readStripeId(session.payment_intent),
  })
}

export async function recordCreatorCheckoutPayment(session: Stripe.Checkout.Session) {
  if (session.mode === 'subscription') return null
  const context = await contextFromStripeMetadata(session.metadata, {
    userId: session.metadata?.userId,
    anonymousActorId: session.metadata?.anonymousActorId,
    mobileInstallId: session.metadata?.mobileInstallId,
  })
  if (!context) return null
  return insertAttributionEvent({
    ...context,
    eventType: 'payment',
    dedupeKey: `creator-payment:checkout:${session.id}`,
    amountCents: session.amount_total || 0,
    currency: session.currency || 'usd',
    stripeCheckoutSessionId: session.id,
    stripeSubscriptionId: readStripeId(session.subscription),
    stripePaymentIntentId: readStripeId(session.payment_intent),
    metadata: { checkoutMode: session.mode },
  })
}

export async function recordCreatorInvoicePayment(invoice: Stripe.Invoice, subscription: Stripe.Subscription) {
  const billingReason = (invoice as Stripe.Invoice & { billing_reason?: string | null }).billing_reason
  const context = await contextFromStripeMetadata(subscription.metadata, { mobileInstallId: subscription.metadata.mobileInstallId })
  if (!context) return null
  return insertAttributionEvent({
    ...context,
    eventType: 'payment',
    dedupeKey: `creator-payment:invoice:${invoice.id}`,
    amountCents: invoice.amount_paid,
    currency: invoice.currency,
    stripeSubscriptionId: subscription.id,
    stripePaymentIntentId: readInvoicePaymentIntentId(invoice),
    metadata: { billingReason },
  })
}

export async function recordCreatorPaymentReversal(input: {
  eventId: string
  paymentIntentId: string
  eventType: 'refund' | 'dispute'
  amountCents: number
  currency: string
}) {
  const entitlement = await db.query.paymentEntitlements.findFirst({
    where: eq(schema.paymentEntitlements.stripePaymentIntentId, input.paymentIntentId),
  })
  const paymentEvent = entitlement ? null : await db.query.creatorAttributionEvents.findFirst({
    where: and(
      eq(schema.creatorAttributionEvents.stripePaymentIntentId, input.paymentIntentId),
      eq(schema.creatorAttributionEvents.eventType, 'payment')
    ),
  })
  const metadata = entitlement?.metadata || {}
  const context = entitlement
    ? await contextFromStripeMetadata(metadata as Record<string, unknown>, {
        userId: entitlement.userId,
        anonymousActorId: entitlement.anonymousActorId,
        mobileInstallId: entitlement.mobileInstallId,
      })
    : paymentEvent?.clickId ? {
        token: signClickId(paymentEvent.clickId || ''),
        clickId: paymentEvent.clickId,
        trackingLinkId: paymentEvent.trackingLinkId,
        firstClickId: paymentEvent.firstClickId || paymentEvent.clickId,
        firstTrackingLinkId: paymentEvent.firstTrackingLinkId || paymentEvent.trackingLinkId,
        attributionKey: paymentEvent.attributionKey,
        userId: paymentEvent.userId,
        anonymousActorId: paymentEvent.anonymousActorId,
        mobileInstallId: paymentEvent.mobileInstallId,
      } : null
  if (!context) return null
  return insertAttributionEvent({
    ...context,
    eventType: input.eventType,
    dedupeKey: `creator-${input.eventType}:${input.eventId}`,
    amountCents: -Math.abs(input.amountCents),
    currency: input.currency,
    stripePaymentIntentId: input.paymentIntentId,
  })
}

export async function getCreatorAttributionReport() {
  const [links, clickRows, eventRows, firstEventRows] = await Promise.all([
    db.select({
      trackingLinkId: schema.creatorTrackingLinks.id,
      socialAccountId: schema.creatorSocialAccounts.id,
      creatorProfileId: schema.creatorProfiles.id,
      creatorName: schema.creatorProfiles.displayName,
      creatorEmail: schema.users.email,
      platform: schema.creatorSocialAccounts.platform,
      handle: schema.creatorSocialAccounts.handle,
      slug: schema.creatorTrackingLinks.slug,
      publicUrl: schema.creatorTrackingLinks.publicUrl,
      deepLinkBaseUrl: schema.creatorTrackingLinks.deepLinkBaseUrl,
      iosAppStoreUrl: schema.creatorTrackingLinks.iosAppStoreUrl,
      androidAppStoreUrl: schema.creatorTrackingLinks.androidAppStoreUrl,
      isActive: schema.creatorTrackingLinks.isActive,
      createdAt: schema.creatorTrackingLinks.createdAt,
    }).from(schema.creatorTrackingLinks)
      .innerJoin(schema.creatorSocialAccounts, eq(schema.creatorTrackingLinks.socialAccountId, schema.creatorSocialAccounts.id))
      .innerJoin(schema.creatorProfiles, eq(schema.creatorSocialAccounts.creatorProfileId, schema.creatorProfiles.id))
      .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id)),
    db.select({
      trackingLinkId: schema.creatorAttributionClicks.trackingLinkId,
      clicks: sql<number>`count(*) filter (where not ${schema.creatorAttributionClicks.isBot})::int`,
      uniqueClicks: sql<number>`count(distinct ${schema.creatorAttributionClicks.anonymousActorId}) filter (where not ${schema.creatorAttributionClicks.isBot})::int`,
      botClicks: sql<number>`count(*) filter (where ${schema.creatorAttributionClicks.isBot})::int`,
      recentClicks: sql<number>`count(*) filter (where not ${schema.creatorAttributionClicks.isBot} and ${schema.creatorAttributionClicks.createdAt} >= now() - interval '30 days')::int`,
    }).from(schema.creatorAttributionClicks).groupBy(schema.creatorAttributionClicks.trackingLinkId),
    db.select({
      trackingLinkId: schema.creatorAttributionEvents.trackingLinkId,
      signups: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'signup')::int`,
      installs: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'install')::int`,
      checkouts: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'checkout')::int`,
      purchases: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0)::int`,
      paidCustomers: sql<number>`count(distinct ${schema.creatorAttributionEvents.attributionKey}) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0)::int`,
      refunds: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'refund')::int`,
      disputes: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'dispute')::int`,
      grossRevenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0), 0)::int`,
      reversedRevenueCents: sql<number>`abs(coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where ${schema.creatorAttributionEvents.eventType} in ('refund', 'dispute')), 0))::int`,
      revenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where ${schema.creatorAttributionEvents.eventType} in ('payment', 'refund', 'dispute')), 0)::int`,
      recentSignups: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'signup' and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentInstalls: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'install' and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentPaidCustomers: sql<number>`count(distinct ${schema.creatorAttributionEvents.attributionKey}) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0 and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentRevenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where ${schema.creatorAttributionEvents.eventType} in ('payment', 'refund', 'dispute') and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days'), 0)::int`,
    }).from(schema.creatorAttributionEvents).groupBy(schema.creatorAttributionEvents.trackingLinkId),
    db.select({
      trackingLinkId: schema.creatorAttributionEvents.firstTrackingLinkId,
      firstTouchSignups: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'signup')::int`,
      firstTouchPaidCustomers: sql<number>`count(distinct ${schema.creatorAttributionEvents.attributionKey}) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0)::int`,
      firstTouchRevenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where ${schema.creatorAttributionEvents.eventType} in ('payment', 'refund', 'dispute')), 0)::int`,
    }).from(schema.creatorAttributionEvents)
      .where(sql`${schema.creatorAttributionEvents.firstTrackingLinkId} is not null`)
      .groupBy(schema.creatorAttributionEvents.firstTrackingLinkId),
  ])
  const clicksByLink = new Map(clickRows.map((row) => [row.trackingLinkId, row]))
  const eventsByLink = new Map(eventRows.map((row) => [row.trackingLinkId, row]))
  const firstEventsByLink = new Map(firstEventRows.map((row) => [row.trackingLinkId, row]))
  return links.map((link) => ({
    ...link,
    clicks: clicksByLink.get(link.trackingLinkId)?.clicks || 0,
    uniqueClicks: clicksByLink.get(link.trackingLinkId)?.uniqueClicks || 0,
    botClicks: clicksByLink.get(link.trackingLinkId)?.botClicks || 0,
    recentClicks: clicksByLink.get(link.trackingLinkId)?.recentClicks || 0,
    signups: eventsByLink.get(link.trackingLinkId)?.signups || 0,
    installs: eventsByLink.get(link.trackingLinkId)?.installs || 0,
    checkouts: eventsByLink.get(link.trackingLinkId)?.checkouts || 0,
    purchases: eventsByLink.get(link.trackingLinkId)?.purchases || 0,
    paidCustomers: eventsByLink.get(link.trackingLinkId)?.paidCustomers || 0,
    refunds: eventsByLink.get(link.trackingLinkId)?.refunds || 0,
    disputes: eventsByLink.get(link.trackingLinkId)?.disputes || 0,
    grossRevenueCents: eventsByLink.get(link.trackingLinkId)?.grossRevenueCents || 0,
    reversedRevenueCents: eventsByLink.get(link.trackingLinkId)?.reversedRevenueCents || 0,
    revenueCents: eventsByLink.get(link.trackingLinkId)?.revenueCents || 0,
    recentSignups: eventsByLink.get(link.trackingLinkId)?.recentSignups || 0,
    recentInstalls: eventsByLink.get(link.trackingLinkId)?.recentInstalls || 0,
    recentPaidCustomers: eventsByLink.get(link.trackingLinkId)?.recentPaidCustomers || 0,
    recentRevenueCents: eventsByLink.get(link.trackingLinkId)?.recentRevenueCents || 0,
    firstTouchSignups: firstEventsByLink.get(link.trackingLinkId)?.firstTouchSignups || 0,
    firstTouchPaidCustomers: firstEventsByLink.get(link.trackingLinkId)?.firstTouchPaidCustomers || 0,
    firstTouchRevenueCents: firstEventsByLink.get(link.trackingLinkId)?.firstTouchRevenueCents || 0,
  }))
}

async function contextFromStripeMetadata(metadata: Record<string, unknown> | null, owner: AttributionOwner) {
  const trackingLinkId = readString(metadata?.creatorTrackingLinkId)
  const clickId = readString(metadata?.creatorClickId)
  if (!trackingLinkId || !clickId) return null
  const click = await db.query.creatorAttributionClicks.findFirst({
    where: and(eq(schema.creatorAttributionClicks.id, clickId), eq(schema.creatorAttributionClicks.trackingLinkId, trackingLinkId)),
  })
  if (!click || click.isBot) return null
  return {
    token: signClickId(clickId),
    clickId,
    trackingLinkId,
    firstClickId: readString(metadata?.creatorFirstClickId) || clickId,
    firstTrackingLinkId: readString(metadata?.creatorFirstTrackingLinkId) || trackingLinkId,
    userId: owner.userId || null,
    anonymousActorId: owner.anonymousActorId || click.anonymousActorId,
    mobileInstallId: owner.mobileInstallId || null,
    attributionKey: readString(metadata?.creatorAttributionKey) || getAttributionKey(owner, click.anonymousActorId, clickId),
  } satisfies CreatorAttributionContext
}

async function insertAttributionEvent(input: CreatorAttributionContext & {
  eventType: 'signup' | 'install' | 'checkout' | 'payment' | 'refund' | 'dispute' | 'subscription_cancellation' | 'subscription_expiration' | 'subscription_billing_issue' | 'subscription_reactivation'
  dedupeKey: string
  amountCents?: number
  currency?: string
  stripeCheckoutSessionId?: string | null
  stripeSubscriptionId?: string | null
  stripePaymentIntentId?: string | null
  metadata?: Record<string, unknown>
}) {
  const [event] = await db.insert(schema.creatorAttributionEvents).values({
    trackingLinkId: input.trackingLinkId,
    clickId: input.clickId,
    firstTrackingLinkId: input.firstTrackingLinkId,
    firstClickId: input.firstClickId,
    eventType: input.eventType,
    attributionKey: input.attributionKey,
    userId: input.userId || null,
    anonymousActorId: input.anonymousActorId || null,
    mobileInstallId: input.mobileInstallId || null,
    stripeCheckoutSessionId: input.stripeCheckoutSessionId || null,
    stripeSubscriptionId: input.stripeSubscriptionId || null,
    stripePaymentIntentId: input.stripePaymentIntentId || null,
    amountCents: input.amountCents || 0,
    currency: (input.currency || 'USD').toUpperCase().slice(0, 3),
    dedupeKey: input.dedupeKey,
    metadata: input.metadata || {},
  }).onConflictDoNothing({ target: schema.creatorAttributionEvents.dedupeKey }).returning()
  return event || null
}

function getAttributionKey(owner: AttributionOwner, fallbackActorId: string | null, clickId: string) {
  if (owner.userId) return `user:${owner.userId}`
  if (owner.mobileInstallId) return `install:${owner.mobileInstallId}`
  if (owner.anonymousActorId || fallbackActorId) return `actor:${owner.anonymousActorId || fallbackActorId}`
  return `click:${clickId}`
}

function buildIosAppStoreUrl(slug: string) {
  const url = new URL(env.NEXT_PUBLIC_IOS_APP_STORE_URL || DEFAULT_IOS_APP_STORE_URL)
  url.searchParams.set('ct', slug.slice(0, 30))
  if (env.APPLE_APP_STORE_PROVIDER_TOKEN) url.searchParams.set('pt', env.APPLE_APP_STORE_PROVIDER_TOKEN)
  return url.toString()
}

function buildDeepLinkUrl(base: string, token: string, slug: string) {
  const url = new URL(base)
  url.searchParams.set('attribution_token', token)
  url.searchParams.set('creator', slug)
  return url.toString()
}

function buildDeferredDeepLinkUrl(link: typeof schema.creatorTrackingLinks.$inferSelect, token: string) {
  const deepLink = buildDeepLinkUrl(link.deepLinkBaseUrl, token, link.slug)
  const template = env.CREATOR_DEFERRED_DEEP_LINK_TEMPLATE
  if (!template) return deepLink
  return template
    .replaceAll('{token}', encodeURIComponent(token))
    .replaceAll('{creator}', encodeURIComponent(link.slug))
    .replaceAll('{deep_link}', encodeURIComponent(deepLink))
    .replaceAll('{ios_url}', encodeURIComponent(link.iosAppStoreUrl))
    .replaceAll('{android_url}', encodeURIComponent(link.androidAppStoreUrl || CREATOR_LINK_BASE_URL))
}

function signClickId(clickId: string) {
  return `${clickId}.${signatureFor(clickId)}`
}

function verifyClickToken(token: string) {
  const [clickId, signature, extra] = token.split('.')
  if (!clickId || !signature || extra || !/^[a-f0-9-]{36}$/.test(clickId)) return null
  const expected = signatureFor(clickId)
  const left = Buffer.from(signature)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null
  return clickId
}

function signatureFor(clickId: string) {
  return createHmac('sha256', env.NEXTAUTH_SECRET || env.STRIPE_WEBHOOK_SECRET || env.DATABASE_URL)
    .update(`creator-attribution:${clickId}`)
    .digest('base64url')
}

function appendSetCookie(res: NextApiResponse, cookie: string) {
  const current = res.getHeader('Set-Cookie')
  const cookies = Array.isArray(current) ? current.map(String) : current ? [String(current)] : []
  res.setHeader('Set-Cookie', [...cookies, cookie])
}

function readCookie(header: string, name: string) {
  const value = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1)
  if (!value) return null
  try { return decodeURIComponent(value) } catch { return null }
}

function readSubscriberAttribute(attributes: Record<string, { value?: unknown }> | undefined, key: string) {
  const value = attributes?.[key]?.value
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

function isLinkPreviewOrBot(userAgent: string) {
  return /(bot|crawler|spider|preview|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|TikTokBot)/i.test(userAgent)
}

function readStripeId(value: string | { id: string } | null) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}

function readInvoicePaymentIntentId(invoice: Stripe.Invoice) {
  const value = (invoice as Stripe.Invoice & { payment_intent?: string | Stripe.PaymentIntent | null }).payment_intent
  return readStripeId(value || null)
}

function readString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}
