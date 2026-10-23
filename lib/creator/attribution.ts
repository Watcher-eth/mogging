import { createHmac, timingSafeEqual } from 'crypto'
import { and, asc, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm'
import type { NextApiRequest, NextApiResponse } from 'next'
import type Stripe from 'stripe'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/api/http'
import { allocateCreatorBillingEvent } from './billing-attribution'
import { buildCreatorDeepLink } from './link-routing'
import { resolveCreatorPostLink } from './post-identity'

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
  creatorSlug?: string
  clickId: string
  trackingLinkId: string
  firstClickId: string
  firstTrackingLinkId: string
  attributionKey: string
}

export type PublicCreatorAttributionContext = Pick<CreatorAttributionContext,
  'clickId' | 'trackingLinkId' | 'firstClickId' | 'firstTrackingLinkId' | 'attributionKey'>

export function creatorReferralHandle(value: string | null | undefined) {
  const handle = value?.trim().replace(/^@/, '').toLowerCase()
  return handle && /^[a-z0-9._]{1,40}$/.test(handle) && /[a-z0-9]/.test(handle) ? handle : null
}

export function ensureCreatorTrackingLink(socialAccountId: string) {
  return saveCreatorTrackingLink(socialAccountId, true)
}

export async function syncCreatorTrackingLinkHandle(link: typeof schema.creatorTrackingLinks.$inferSelect) {
  return await saveCreatorTrackingLink(link.socialAccountId, false) || link
}

async function saveCreatorTrackingLink(socialAccountId: string, activate: boolean) {
  return db.transaction(async (tx) => {
    // One owner for creation, migration and aliases; serialize reconnects for this account.
    const [account] = await tx.select().from(schema.creatorSocialAccounts)
      .where(eq(schema.creatorSocialAccounts.id, socialAccountId)).for('update')
    if (!account) throw new Error('Creator social account not found')
    const handle = creatorReferralHandle(account.handle)
    if (!handle) return null
    const existing = await tx.query.creatorTrackingLinks.findFirst({
      where: eq(schema.creatorTrackingLinks.socialAccountId, socialAccountId),
    })
    // One referral identity per creator and handle, shared across platforms.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-referral-owner:${account.creatorProfileId}:${handle}`}, 0))`)
    const sameHandleAccounts = await tx.query.creatorSocialAccounts.findMany({
      where: and(eq(schema.creatorSocialAccounts.creatorProfileId, account.creatorProfileId), eq(schema.creatorSocialAccounts.handle, handle)),
      orderBy: [asc(schema.creatorSocialAccounts.createdAt)],
      with: { trackingLink: true },
    })
    const ownedLinks = sameHandleAccounts.flatMap(other => other.trackingLink?.isActive ? [other.trackingLink] : [])
    const shared = ownedLinks.find(link => link.publicUrl === `${CREATOR_LINK_BASE_URL}/r/${handle}`) || ownedLinks[0]
    if (shared && shared.id !== existing?.id) return shared
    // A handle owned by another creator must retain its published aliases.
    let referralHandle = handle
    let aliases: string[] = []
    for (const candidate of [handle, `${handle}-${account.platform}`, `${handle}-${account.platform}-${account.id}`]) {
      const candidateAliases = [candidate, `mogging-${candidate}`].sort()
      let available = true
      for (const slug of candidateAliases) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-referral:${slug}`}, 0))`)
        const canonical = await tx.query.creatorTrackingLinks.findFirst({ where: eq(schema.creatorTrackingLinks.slug, slug) })
        const alias = await tx.query.creatorTrackingLinkAliases.findFirst({ where: eq(schema.creatorTrackingLinkAliases.slug, slug) })
        if ((canonical && canonical.id !== existing?.id) || (alias && alias.trackingLinkId !== existing?.id)) available = false
      }
      if (available) {
        referralHandle = candidate
        aliases = candidateAliases
        break
      }
    }
    if (!aliases.length) throw new ApiError(409, 'Could not reserve a referral link for this account')
    const code = `mogging-${referralHandle}`
    const publicUrl = `${CREATOR_LINK_BASE_URL}/r/${referralHandle}`
    let link = existing
    if (!link) {
      ;[link] = await tx.insert(schema.creatorTrackingLinks).values({
        socialAccountId, slug: code, publicUrl,
        deepLinkBaseUrl: CREATOR_APP_DEEP_LINK,
        iosAppStoreUrl: buildIosAppStoreUrl(code),
        androidAppStoreUrl: env.NEXT_PUBLIC_ANDROID_APP_STORE_URL || null,
      }).returning()
    } else if (link.publicUrl !== publicUrl || (activate && !link.isActive) || link.deepLinkBaseUrl !== CREATOR_APP_DEEP_LINK) {
      ;[link] = await tx.update(schema.creatorTrackingLinks).set({
        publicUrl, isActive: activate || link.isActive,
        deepLinkBaseUrl: CREATOR_APP_DEEP_LINK, updatedAt: new Date(),
      }).where(eq(schema.creatorTrackingLinks.id, link.id)).returning()
    }
    for (const slug of aliases) {
      await tx.insert(schema.creatorTrackingLinkAliases).values({ slug, trackingLinkId: link.id }).onConflictDoNothing()
    }
    return link
  })
}

export async function setCreatorTrackingLinkActive(socialAccountId: string, isActive: boolean) {
  await db.update(schema.creatorTrackingLinks).set({ isActive, updatedAt: new Date() }).where(eq(schema.creatorTrackingLinks.socialAccountId, socialAccountId))
}

export async function findCreatorTrackingLink(slug: string) {
  let submissionId: string | null = null
  let link = await db.query.creatorTrackingLinks.findFirst({
    where: eq(schema.creatorTrackingLinks.slug, slug),
  })
  if (!link) {
    const alias = await db.query.creatorTrackingLinkAliases.findFirst({
      where: eq(schema.creatorTrackingLinkAliases.slug, slug),
    })
    if (alias) {
      submissionId = alias.submissionId
      link = await db.query.creatorTrackingLinks.findFirst({ where: eq(schema.creatorTrackingLinks.id, alias.trackingLinkId) })
    }
  }
  return link?.isActive ? { ...link, submissionId } : null
}

export async function findCreatorTrackingLinkForPost(postUrl: string) {
  let post: { key: string; url: string }
  try { post = await resolveCreatorPostLink(postUrl) }
  catch { throw new ApiError(400, 'Open the post and paste its full TikTok or Instagram URL, or enter the creator’s code.') }
  const [match] = await db.select({ link: schema.creatorTrackingLinks, submissionId: schema.creatorSubmissions.id })
    .from(schema.creatorSubmissions)
    .innerJoin(schema.creatorSocialAccounts, and(eq(schema.creatorSocialAccounts.id, schema.creatorSubmissions.socialAccountId), eq(schema.creatorSocialAccounts.creatorProfileId, schema.creatorSubmissions.creatorProfileId)))
    .innerJoin(schema.creatorProfiles, eq(schema.creatorProfiles.id, schema.creatorSocialAccounts.creatorProfileId))
    .innerJoin(schema.creatorTrackingLinks, eq(schema.creatorTrackingLinks.socialAccountId, schema.creatorSocialAccounts.id))
    .where(and(or(eq(schema.creatorSubmissions.postKey, post.key), eq(schema.creatorSubmissions.postUrl, post.url)),
      eq(schema.creatorSubmissions.isDraft, false), eq(schema.creatorSocialAccounts.status, 'approved'),
      ne(schema.creatorProfiles.authStatus, 'suspended'), eq(schema.creatorTrackingLinks.isActive, true))).limit(1)
  return match ? { ...match.link, submissionId: match.submissionId } : null
}

export async function createCreatorAttributionClick(input: ({ slug: string; postUrl?: never } | { postUrl: string; slug?: never }) & {
  anonymousActorId: string | null
  referrer?: string | null
  userAgent?: string | null
  source?: 'browser' | 'native_link' | 'creator_code'
  placement?: string | null
  resumeToken?: string | null
}) {
  const link = input.postUrl ? await findCreatorTrackingLinkForPost(input.postUrl) : await findCreatorTrackingLink(input.slug || '')
  if (!link) return null
  // Apply current campaign configuration to existing links without rewriting their destination.
  link.iosAppStoreUrl = buildIosAppStoreUrl(`c-${link.id.replace(/-/g, "").slice(0, 24)}`, link.iosAppStoreUrl)
  const isBot = isLinkPreviewOrBot(input.userAgent || '')
  const resumed = !isBot && input.resumeToken ? await resolveCreatorAttribution({ token: input.resumeToken }) : null
  let click = resumed?.trackingLinkId === link.id ? await db.query.creatorAttributionClicks.findFirst({ where: eq(schema.creatorAttributionClicks.id, resumed.clickId) }) : undefined
  if (!click) {
    const [created] = await db.insert(schema.creatorAttributionClicks).values({
    trackingLinkId: link.id,
    anonymousActorId: input.anonymousActorId,
    referrer: input.referrer?.slice(0, 2000) || null,
    userAgent: input.userAgent?.slice(0, 1000) || null,
    isBot,
    source: input.source || 'browser',
    placement: input.placement?.slice(0, 40) || null,
    submissionId: link.submissionId,
  }).returning()
    click = created
  }
  const token = signClickId(click.id)
  return {
    link,
    click,
    token,
    deepLinkUrl: buildCreatorDeepLink(link.slug, token),
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
    creatorSlug: click.trackingLink.slug,
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
  await insertAttributionEvent({ ...context, eventType: 'claim', dedupeKey: `creator-claim:${input.userId}:${context.clickId}` })
  if (!user || !click || user.createdAt.getTime() < click.createdAt.getTime() - 60_000) return null
  return insertAttributionEvent({ ...context, eventType: 'signup', dedupeKey: `creator-signup:${input.userId}` })
}

export async function recordCreatorInstall(input: { token: string; mobileInstallId: string; userId?: string | null }) {
  const context = await resolveMobileCreatorAttribution(input)
  if (!context) return null
  const event = await insertAttributionEvent({ ...context, eventType: 'install', dedupeKey: `creator-install:${input.mobileInstallId}` })
  return { created: Boolean(event), event, context: publicCreatorAttributionContext(context) }
}

export async function recordCreatorPaywallView(input: { token: string; mobileInstallId: string; userId?: string | null }) {
  const context = await resolveMobileCreatorAttribution(input)
  if (!context) return null
  const event = await insertAttributionEvent({
    ...context,
    eventType: 'paywall_view',
    dedupeKey: `creator-paywall:${input.mobileInstallId}`,
    metadata: { source: 'mobile_paywall' },
  })
  return { created: Boolean(event), event, context: publicCreatorAttributionContext(context) }
}

export async function resolveMobileCreatorAttribution(input: { token: string; mobileInstallId: string; userId?: string | null; method?: string }) {
  const direct = await resolveCreatorAttribution({
    token: input.token,
    owner: { mobileInstallId: input.mobileInstallId, userId: input.userId },
  })
  if (!direct) return null

  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`creator-install:${input.mobileInstallId}`}, 0))`)
    const touches = await tx.query.mobileCreatorAttributions.findMany({
      where: eq(schema.mobileCreatorAttributions.mobileInstallId, input.mobileInstallId),
      orderBy: [asc(schema.mobileCreatorAttributions.createdAt)],
    })
    const existing = touches.find(touch => touch.clickId === direct.clickId)
    if (existing?.userId && input.userId && existing.userId !== input.userId) throw new ApiError(409, 'This referral belongs to another account. Open your own creator link.')
    const firstTouch = touches.find(touch => !input.userId || !touch.userId || touch.userId === input.userId)
    const context: CreatorAttributionContext = {
      ...direct,
      firstClickId: firstTouch?.firstClickId || direct.firstClickId,
      firstTrackingLinkId: firstTouch?.firstTrackingLinkId || direct.firstTrackingLinkId,
      attributionKey: firstTouch?.attributionKey || `install:${input.mobileInstallId}`,
    }

    await tx.insert(schema.mobileCreatorAttributions).values({
      mobileInstallId: input.mobileInstallId,
      trackingLinkId: context.trackingLinkId,
      clickId: context.clickId,
      firstTrackingLinkId: context.firstTrackingLinkId,
      firstClickId: context.firstClickId,
      attributionKey: context.attributionKey,
      userId: input.userId || null,
      method: input.method || 'direct',
    }).onConflictDoUpdate({
      target: [schema.mobileCreatorAttributions.mobileInstallId, schema.mobileCreatorAttributions.clickId],
      set: {
        userId: input.userId || existing?.userId || null,
        updatedAt: new Date(),
      },
    })

    return context
  })
}

export async function getStoredMobileCreatorAttribution(input: { mobileInstallId: string; userId?: string | null; anonymousActorId?: string | null }) {
  const touch = await db.query.mobileCreatorAttributions.findFirst({
    where: eq(schema.mobileCreatorAttributions.mobileInstallId, input.mobileInstallId),
    orderBy: [desc(schema.mobileCreatorAttributions.updatedAt)],
  })
  if (!touch || (touch.userId && input.userId && touch.userId !== input.userId)) return null
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
    .where(and(eq(schema.mobileCreatorAttributions.mobileInstallId, input.mobileInstallId), sql`(${schema.mobileCreatorAttributions.userId} is null or ${schema.mobileCreatorAttributions.userId} = ${input.userId})`))
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
  await insertAttributionEvent({ ...context, eventType: 'claim', dedupeKey: `creator-claim:${input.userId}:${context.clickId}` })
  return publicCreatorAttributionContext(context)
}

export async function getAccountCreatorAttribution(userId: string) {
  const claim = await db.query.creatorAttributionEvents.findFirst({
    where: and(eq(schema.creatorAttributionEvents.userId, userId), eq(schema.creatorAttributionEvents.eventType, 'claim')),
    orderBy: [desc(schema.creatorAttributionEvents.createdAt)],
  })
  return claim?.clickId ? resolveCreatorAttribution({ token: signClickId(claim.clickId), owner: { userId } }) : null
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

export function mapRevenueCatAttributionEvent(type: string, cancelReason?: string | null): RevenueCatAttributionEventMapping | null {
  if (['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'REFUND_REVERSED'].includes(type)) {
    return { eventType: 'payment', dedupeCategory: 'payment', amountMultiplier: 1 }
  }
  if (type === 'REFUND' || (type === 'CANCELLATION' && cancelReason === 'CUSTOMER_SUPPORT')) return { eventType: 'refund', dedupeCategory: 'refund', amountMultiplier: -1 }
  if (type === 'CANCELLATION') return { eventType: 'subscription_cancellation', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  if (type === 'EXPIRATION') return { eventType: 'subscription_expiration', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  if (type === 'BILLING_ISSUE') return { eventType: 'subscription_billing_issue', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  if (type === 'UNCANCELLATION') return { eventType: 'subscription_reactivation', dedupeCategory: 'lifecycle', amountMultiplier: 0 }
  return null
}

export async function recordRevenueCatCreatorEvent(event: RevenueCatCreatorEvent) {
  const fact = await db.query.subscriptionEvents.findFirst({
    where: and(eq(schema.subscriptionEvents.provider, 'revenuecat'), eq(schema.subscriptionEvents.providerEventId, event.id)),
  })
  return fact ? allocateCreatorBillingEvent(fact) : null
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
  const fact = await db.query.subscriptionEvents.findFirst({ where: and(
    eq(schema.subscriptionEvents.provider, 'stripe'), eq(schema.subscriptionEvents.providerEventId, `checkout:${session.id}`),
  ) })
  return fact ? allocateCreatorBillingEvent(fact) : null
}

export async function recordCreatorInvoicePayment(invoice: Stripe.Invoice, _subscription: Stripe.Subscription) {
  const fact = await db.query.subscriptionEvents.findFirst({ where: and(
    eq(schema.subscriptionEvents.provider, 'stripe'), sql`${schema.subscriptionEvents.properties}->>'invoice_id' = ${invoice.id}`,
  ) })
  return fact ? allocateCreatorBillingEvent(fact) : null
}

export async function recordCreatorPaymentReversal(input: { eventId: string; paymentIntentId: string; eventType: 'refund' | 'dispute'; amountCents: number; currency: string }) {
  // Individual verified refund/dispute facts own reversals; never add a cumulative charge total.
  const facts = await db.query.subscriptionEvents.findMany({ where: and(
    eq(schema.subscriptionEvents.provider, 'stripe'), eq(schema.subscriptionEvents.transactionId, input.paymentIntentId),
    inArray(schema.subscriptionEvents.eventName, ['subscription_refunded', 'payment_disputed']),
  ) })
  for (const fact of facts) await allocateCreatorBillingEvent(fact)
}

export async function getCreatorAttributionReport() {
  const productionEvents = sql`lower(coalesce(${schema.creatorAttributionEvents.metadata}->>'environment', 'production')) != 'sandbox' and not exists(select 1 from users u where u.id=${schema.creatorAttributionEvents.userId} and u.analytics_internal)`
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
      clicks: sql<number>`count(*) filter (where not ${schema.creatorAttributionClicks.isBot} and ${schema.creatorAttributionClicks.source} = 'browser')::int`,
      uniqueClicks: sql<number>`count(distinct ${schema.creatorAttributionClicks.anonymousActorId}) filter (where not ${schema.creatorAttributionClicks.isBot} and ${schema.creatorAttributionClicks.source} = 'browser')::int`,
      botClicks: sql<number>`count(*) filter (where ${schema.creatorAttributionClicks.isBot})::int`,
      recentClicks: sql<number>`count(*) filter (where not ${schema.creatorAttributionClicks.isBot} and ${schema.creatorAttributionClicks.source} = 'browser' and ${schema.creatorAttributionClicks.createdAt} >= now() - interval '30 days')::int`,
    }).from(schema.creatorAttributionClicks).groupBy(schema.creatorAttributionClicks.trackingLinkId),
    db.select({
      trackingLinkId: schema.creatorAttributionEvents.trackingLinkId,
      signups: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'signup')::int`,
      installs: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'install')::int`,
      paywallViews: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'paywall_view')::int`,
      checkouts: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'checkout')::int`,
      purchases: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0)::int`,
      paidCustomers: sql<number>`count(distinct coalesce(${schema.creatorAttributionEvents.userId}, ${schema.creatorAttributionEvents.attributionKey})) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0)::int`,
      refunds: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'refund')::int`,
      disputes: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'dispute')::int`,
      grossRevenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where upper(${schema.creatorAttributionEvents.currency}) = 'USD' and ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0), 0)::int`,
      reversedRevenueCents: sql<number>`abs(coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where upper(${schema.creatorAttributionEvents.currency}) = 'USD' and ${schema.creatorAttributionEvents.eventType} in ('refund', 'dispute')), 0))::int`,
      revenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where upper(${schema.creatorAttributionEvents.currency}) = 'USD' and ${schema.creatorAttributionEvents.eventType} in ('payment', 'refund', 'dispute')), 0)::int`,
      recentSignups: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'signup' and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentInstalls: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'install' and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentPaywallViews: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'paywall_view' and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentPaidCustomers: sql<number>`count(distinct coalesce(${schema.creatorAttributionEvents.userId}, ${schema.creatorAttributionEvents.attributionKey})) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0 and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days')::int`,
      recentRevenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where upper(${schema.creatorAttributionEvents.currency}) = 'USD' and ${schema.creatorAttributionEvents.eventType} in ('payment', 'refund', 'dispute') and ${schema.creatorAttributionEvents.createdAt} >= now() - interval '30 days'), 0)::int`,
    }).from(schema.creatorAttributionEvents).where(productionEvents).groupBy(schema.creatorAttributionEvents.trackingLinkId),
    db.select({
      trackingLinkId: schema.creatorAttributionEvents.firstTrackingLinkId,
      firstTouchSignups: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'signup')::int`,
      firstTouchPaywallViews: sql<number>`count(*) filter (where ${schema.creatorAttributionEvents.eventType} = 'paywall_view')::int`,
      firstTouchPaidCustomers: sql<number>`count(distinct coalesce(${schema.creatorAttributionEvents.userId}, ${schema.creatorAttributionEvents.attributionKey})) filter (where ${schema.creatorAttributionEvents.eventType} = 'payment' and ${schema.creatorAttributionEvents.amountCents} > 0)::int`,
      firstTouchRevenueCents: sql<number>`coalesce(sum(${schema.creatorAttributionEvents.amountCents}) filter (where upper(${schema.creatorAttributionEvents.currency}) = 'USD' and ${schema.creatorAttributionEvents.eventType} in ('payment', 'refund', 'dispute')), 0)::int`,
    }).from(schema.creatorAttributionEvents)
      .where(and(productionEvents, sql`${schema.creatorAttributionEvents.firstTrackingLinkId} is not null`))
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
    paywallViews: eventsByLink.get(link.trackingLinkId)?.paywallViews || 0,
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
    recentPaywallViews: eventsByLink.get(link.trackingLinkId)?.recentPaywallViews || 0,
    recentPaidCustomers: eventsByLink.get(link.trackingLinkId)?.recentPaidCustomers || 0,
    recentRevenueCents: eventsByLink.get(link.trackingLinkId)?.recentRevenueCents || 0,
    firstTouchSignups: firstEventsByLink.get(link.trackingLinkId)?.firstTouchSignups || 0,
    firstTouchPaywallViews: firstEventsByLink.get(link.trackingLinkId)?.firstTouchPaywallViews || 0,
    firstTouchPaidCustomers: firstEventsByLink.get(link.trackingLinkId)?.firstTouchPaidCustomers || 0,
    firstTouchRevenueCents: firstEventsByLink.get(link.trackingLinkId)?.firstTouchRevenueCents || 0,
  }))
}

async function insertAttributionEvent(input: CreatorAttributionContext & {
  eventType: 'claim' | 'signup' | 'install' | 'paywall_view' | 'checkout' | 'payment' | 'refund' | 'dispute' | 'subscription_cancellation' | 'subscription_expiration' | 'subscription_billing_issue' | 'subscription_reactivation'
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
    metadata: { ...input.metadata },
  }).onConflictDoNothing({ target: schema.creatorAttributionEvents.dedupeKey }).returning()
  return event || null
}

function getAttributionKey(owner: AttributionOwner, fallbackActorId: string | null, clickId: string) {
  if (owner.userId) return `user:${owner.userId}`
  if (owner.mobileInstallId) return `install:${owner.mobileInstallId}`
  if (owner.anonymousActorId || fallbackActorId) return `actor:${owner.anonymousActorId || fallbackActorId}`
  return `click:${clickId}`
}

function buildIosAppStoreUrl(slug: string, base?: string) {
  const url = new URL(base || env.NEXT_PUBLIC_IOS_APP_STORE_URL || DEFAULT_IOS_APP_STORE_URL)
  url.searchParams.set('ct', slug.slice(0, 30))
  if (env.APPLE_APP_STORE_PROVIDER_TOKEN) url.searchParams.set('pt', env.APPLE_APP_STORE_PROVIDER_TOKEN)
  return url.toString()
}

export function signClickId(clickId: string) {
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

function isLinkPreviewOrBot(userAgent: string) {
  return /(bot|crawler|spider|preview|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|TikTokBot)/i.test(userAgent)
}

function readStripeId(value: string | { id: string } | null) {
  if (!value) return null
  return typeof value === 'string' ? value : value.id
}
