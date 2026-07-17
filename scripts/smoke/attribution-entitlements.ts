import assert from 'node:assert/strict'
import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import type Stripe from 'stripe'
import { createCreatorAttributionClick, recordCreatorInstall } from '@/lib/creator/attribution'
import { db, schema } from '@/lib/db'
import { getEntitlementSummary, grantEntitlementFromCheckoutSession } from '@/lib/payments/entitlements'

const runId = randomUUID().replaceAll('-', '')
const creatorInstallId = `mob_smoke_creator_${runId}`
const accountInstallId = `mob_smoke_account_${runId}`
const anonymousInstallId = `mob_smoke_anon_${runId}`
const accountWebInstallId = `web_smoke_account_${runId}`
const anonymousWebInstallId = `web_smoke_anon_${runId}`
const accountSessionId = `cs_smoke_account_${runId}`
const anonymousSessionId = `cs_smoke_anon_${runId}`
const email = `codex-attribution-${runId}@mogging.invalid`

let clickId: string | null = null
let userId: string | null = null
let trackingLinkId: string | null = null

try {
  const [user] = await db.insert(schema.users).values({
    email,
    emailVerified: new Date(),
    name: 'Attribution Smoke Test',
  }).returning({ id: schema.users.id })
  assert.ok(user)
  userId = user.id

  const [profile] = await db.insert(schema.creatorProfiles).values({
    userId: user.id,
    displayName: 'Attribution Smoke Test',
    authStatus: 'verified',
  }).returning({ id: schema.creatorProfiles.id })
  const [socialAccount] = await db.insert(schema.creatorSocialAccounts).values({
    creatorProfileId: profile.id,
    platform: 'tiktok',
    handle: `smoke_${runId}`,
    status: 'approved',
  }).returning({ id: schema.creatorSocialAccounts.id })
  const slug = `tiktok-smoke-${runId}`
  const [trackingLink] = await db.insert(schema.creatorTrackingLinks).values({
    socialAccountId: socialAccount.id,
    slug,
    publicUrl: `https://www.mogging.com/r/${slug}`,
    deepLinkBaseUrl: 'mogging://attribution',
    iosAppStoreUrl: 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050',
  }).returning({ id: schema.creatorTrackingLinks.id, slug: schema.creatorTrackingLinks.slug })
  trackingLinkId = trackingLink.id

  const attribution = await createCreatorAttributionClick({
    slug: trackingLink.slug,
    anonymousActorId: `smoke_actor_${runId}`,
    referrer: 'https://www.tiktok.com/',
    userAgent: 'Mogging attribution smoke test',
  })
  assert.ok(attribution)
  clickId = attribution.click.id

  const install = await recordCreatorInstall({
    token: attribution.token,
    mobileInstallId: creatorInstallId,
  })
  assert.equal(install?.created, true)

  const installEvent = await db.query.creatorAttributionEvents.findFirst({
    where: and(
      eq(schema.creatorAttributionEvents.mobileInstallId, creatorInstallId),
      eq(schema.creatorAttributionEvents.eventType, 'install')
    ),
  })
  assert.equal(installEvent?.trackingLinkId, trackingLink.id)
  assert.equal(installEvent?.clickId, attribution.click.id)

  await grantEntitlementFromCheckoutSession({
    session: mockPaidLifetimeSession(accountSessionId, accountWebInstallId, user.id),
  })
  const accountEntitlements = await getEntitlementSummary({
    mobileInstallId: accountInstallId,
    userId: user.id,
  })
  assert.equal(accountEntitlements.subscription.active, true)

  await grantEntitlementFromCheckoutSession({
    session: mockPaidLifetimeSession(anonymousSessionId, anonymousWebInstallId, null),
  })
  await grantEntitlementFromCheckoutSession({
    session: mockPaidLifetimeSession(anonymousSessionId, anonymousWebInstallId, null),
    mobileInstallId: anonymousInstallId,
  })
  const anonymousEntitlements = await getEntitlementSummary(anonymousInstallId)
  assert.equal(anonymousEntitlements.subscription.active, true)

  console.log(JSON.stringify({
    creatorInstallAttribution: 'ok',
    accountWebPurchaseInIos: 'ok',
    anonymousWebPurchaseTransfer: 'ok',
  }))
} finally {
  await db.delete(schema.creatorAttributionEvents).where(eq(schema.creatorAttributionEvents.mobileInstallId, creatorInstallId))
  if (clickId) await db.delete(schema.creatorAttributionClicks).where(eq(schema.creatorAttributionClicks.id, clickId))
  await db.delete(schema.paymentEntitlements).where(eq(schema.paymentEntitlements.stripeCheckoutSessionId, accountSessionId))
  await db.delete(schema.paymentEntitlements).where(eq(schema.paymentEntitlements.stripeCheckoutSessionId, anonymousSessionId))
  if (trackingLinkId) await db.delete(schema.creatorTrackingLinks).where(eq(schema.creatorTrackingLinks.id, trackingLinkId))
  if (userId) await db.delete(schema.users).where(eq(schema.users.id, userId))
}

function mockPaidLifetimeSession(id: string, mobileInstallId: string, linkedUserId: string | null) {
  return {
    id,
    mode: 'payment',
    payment_status: 'paid',
    status: 'complete',
    customer: null,
    payment_intent: null,
    subscription: null,
    metadata: {
      product: 'mobile_lifetime',
      mobileInstallId,
      source: 'smoke_test',
      userId: linkedUserId || '',
      anonymousActorId: '',
      activationCode: '123456',
    },
  } as unknown as Stripe.Checkout.Session
}
