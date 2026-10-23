import assert from 'node:assert/strict'
import { and, eq, sql } from 'drizzle-orm'

// Deliberately refuse production URLs, even when DATABASE_URL is configured locally.
const target = process.env.CREATOR_TEST_DATABASE_URL
if (!target) throw new Error('Set CREATOR_TEST_DATABASE_URL to the isolated local creator_continuity_test database')
const url = new URL(target)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/creator_continuity_test') throw new Error('Creator integration tests require the isolated local test database')
process.env.DATABASE_URL = target
const { db, schema } = await import('../../lib/db')
const { createCreatorAttributionClick, resolveMobileCreatorAttribution, associateMobileCreatorAttribution, getAccountCreatorAttribution, signClickId, ensureCreatorTrackingLink } = await import('../../lib/creator/attribution')
const { createReferralHandoff, redeemReferralHandoff, referralHash } = await import('../../lib/creator/continuity')
const { getCreatorDashboard } = await import('../../lib/creator/service')
const { allocateCreatorBillingEvent, reconcileCreatorBilling } = await import('../../lib/creator/billing-attribution')
const { getCreatorCoverage } = await import('../../lib/admin/creator-coverage')
const { importStoreCampaignCsv } = await import('../../lib/creator/store-campaigns')

const id = () => crypto.randomUUID(), owner = id(), buyer = id(), otherBuyer = id(), creator = id(), account = id(), campaign = id()
let passed = 0
function check(label: string, condition: unknown) { assert.ok(condition, label); passed++; console.log(`PASS ${label}`) }
try {
  await db.insert(schema.users).values([{ id: owner, email: `${owner}@creator.test` }, { id: buyer, email: `${buyer}@buyer.test` }, { id: otherBuyer, email: `${otherBuyer}@buyer.test` }])
  await db.insert(schema.creatorProfiles).values({ id: creator, userId: owner, displayName: 'Continuity fixture', authStatus: 'verified' })
  await db.insert(schema.creatorSocialAccounts).values({ id: account, creatorProfileId: creator, platform: 'tiktok', handle: `fixture_${owner.slice(0,8)}`, status: 'approved' })
  const terms = { milestones: [{ views: 20000, amountCents: 1000 }], minimumTier1Percent: 10, maximumTier1Percent: 100,
    rules: ['Include creator code'], platforms: ['tiktok' as const], formats: [{ id: 'fixture', name: 'Fixture', shortDescription: 'Fixture', active: true,
      elements: [{ title: 'CTA', detail: 'Include code' }], requirements: ['Include code'], notAllowed: [] }] }
  await db.insert(schema.creatorSprints).values({ id: campaign, name: 'Continuity fixture', description: 'Local only', status: 'published', budgetCents: 10000,
    startsAt: new Date(Date.now()-86400000), endsAt: new Date(Date.now()+86400000), terms })
  const accountLink = await ensureCreatorTrackingLink(account)
  assert.ok(accountLink)
  // Model an already-issued link; the retired registration endpoint cannot create more.
  const [post] = await db.insert(schema.creatorSubmissions).values({ creatorProfileId: creator, socialAccountId: account,
    sprintId: campaign, sprintTerms: terms, formatId: 'fixture', title: 'Legacy post', platform: 'TikTok', isDraft: true }).returning()
  const code = `p-${id().replaceAll('-', '').slice(0, 12)}`
  await db.insert(schema.creatorTrackingLinkAliases).values({ slug: code, trackingLinkId: accountLink.id, submissionId: post.id })
  const dashboard = await getCreatorDashboard(owner)
  check('retired setup drafts stay out of the normal creator submission list', !dashboard.submissions.some(item => item.id === post.id) && !('registeredPosts' in dashboard))
  const accountClick = await createCreatorAttributionClick({ slug: accountLink.slug, anonymousActorId: id(), userAgent: 'iPhone Safari' })
  check('one reusable account link works without any post-specific identity', accountClick && accountClick.click.submissionId === null)
  const legacyClick = await createCreatorAttributionClick({ slug: code, anonymousActorId: id(), userAgent: 'iPhone Safari', placement: 'video' })
  check('already-issued post aliases still resolve after setup retirement', legacyClick?.click.submissionId === post.id)
  const videoId = `${Date.now()}${Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')}`
  const postUrl = `https://www.tiktok.com/@fixture_${owner.slice(0,8)}/video/${videoId}`
  await db.update(schema.creatorSubmissions).set({ isDraft: false, postUrl, postKey: `tiktok:${videoId}` }).where(eq(schema.creatorSubmissions.id, post.id))
  check('an unreviewed original post cannot claim creator credit', await createCreatorAttributionClick({ postUrl, anonymousActorId: null }) === null)
  await db.update(schema.creatorSubmissions).set({ status: 'approved' }).where(eq(schema.creatorSubmissions.id, post.id))
  const click = await createCreatorAttributionClick({ postUrl: `${postUrl}?share=viewer`, source: 'creator_code', anonymousActorId: null, userAgent: 'Mogging iOS' })
  check('the original published URL recovers creator and post without a custom creator URL', click?.click.submissionId === post.id && click.link.id === accountLink.id)
  check('unknown original post URLs do not invent creator credit', await createCreatorAttributionClick({ postUrl: postUrl.replace(videoId, String(BigInt(videoId) + BigInt(1))), anonymousActorId: null }) === null)
  await db.update(schema.creatorTrackingLinks).set({ isActive: false }).where(eq(schema.creatorTrackingLinks.id, accountLink.id))
  check('original post recovery cannot bypass an inactive creator link', await createCreatorAttributionClick({ postUrl, anonymousActorId: null }) === null)
  await db.update(schema.creatorTrackingLinks).set({ isActive: true }).where(eq(schema.creatorTrackingLinks.id, accountLink.id))
  assert.ok(click)
  check('original post identity survives signed-click resolution', click.click.submissionId === post.id && click.link.submissionId === post.id)
  check('store destination is first-party configured and has stable campaign mapping', new URL(click.link.iosAppStoreUrl).hostname === 'apps.apple.com' && new URL(click.link.iosAppStoreUrl).searchParams.get('ct')?.startsWith('c-'))
  const verifier = 'a'.repeat(64), install = `mob_${id()}`
  const ticket = await createReferralHandoff(click.click.id, referralHash(verifier))
  await assert.rejects(() => redeemReferralHandoff({ ticket, verifier: 'b'.repeat(64), mobileInstallId: install }))
  const recovered = await redeemReferralHandoff({ ticket, verifier, mobileInstallId: install })
  check('browser recovery requires the app proof and preserves the original click', recovered.token === click.token)
  check('recovery retry tolerates a lost response', (await redeemReferralHandoff({ ticket, verifier, mobileInstallId: install })).clickId === click.click.id)
  await assert.rejects(() => redeemReferralHandoff({ ticket, verifier, mobileInstallId: `mob_${id()}` }))
  check('handoff cannot be replayed into another installation', true)
  await db.update(schema.creatorReferralHandoffs).set({ expiresAt: new Date(Date.now()-1000) }).where(eq(schema.creatorReferralHandoffs.tokenHash, referralHash(ticket)))
  await assert.rejects(() => redeemReferralHandoff({ ticket, verifier, mobileInstallId: install }))
  check('expired recovery tickets are rejected', true)
  await Promise.all([resolveMobileCreatorAttribution({ token: recovered.token, mobileInstallId: install, method: 'browser_recovery' }), resolveMobileCreatorAttribution({ token: recovered.token, mobileInstallId: install, method: 'browser_recovery' })])
  const touches = await db.query.mobileCreatorAttributions.findMany({ where: eq(schema.mobileCreatorAttributions.mobileInstallId, install) })
  check('concurrent recoveries produce one durable touch', touches.length === 1 && touches[0].method === 'browser_recovery')
  await associateMobileCreatorAttribution({ token: recovered.token, mobileInstallId: install, userId: buyer })
  check('same account can recover the original referral on a new installation', (await getAccountCreatorAttribution(buyer))?.clickId === click.click.id)
  await assert.rejects(() => associateMobileCreatorAttribution({ token: recovered.token, mobileInstallId: install, userId: otherBuyer }))
  check('another account cannot steal the installation’s referral ownership', true)
  async function fact(type: string, name: string, amount: string, subscription: string, accountId = buyer, at = new Date()) {
    const [row] = await db.insert(schema.subscriptionEvents).values({ provider: 'revenuecat', providerEventId: id(), providerType: type, environment: 'production',
      eventName: name, externalUserId: accountId, accountId, subscriptionId: subscription, transactionId: id(), productId: 'fixture', amount, currency: 'USD', occurredAt: at }).returning()
    return row
  }
  const original = id(), purchase = await fact('INITIAL_PURCHASE', 'subscription_started', '9.99', original)
  check('verified purchase receives creator credit', await allocateCreatorBillingEvent(purchase) === 'allocated')
  await allocateCreatorBillingEvent(purchase)
  const credited = await db.query.creatorAttributionEvents.findMany({ where: sql`${schema.creatorAttributionEvents.metadata}->>'billingEventId' = ${purchase.id}` })
  check('duplicate delivery does not duplicate revenue', credited.length === 1 && credited[0].amountCents === 999)
  const later = await createCreatorAttributionClick({ slug: click.link.slug, anonymousActorId: id(), userAgent: 'iPhone Safari', source: 'creator_code' })
  assert.ok(later)
  await associateMobileCreatorAttribution({ token: later.token, mobileInstallId: `mob_${id()}`, userId: buyer })
  const renewal = await fact('RENEWAL', 'subscription_renewed', '9.99', original)
  await allocateCreatorBillingEvent(renewal)
  const renewed = await db.query.creatorAttributionEvents.findFirst({ where: sql`${schema.creatorAttributionEvents.metadata}->>'billingEventId' = ${renewal.id}` })
  check('renewal inherits frozen acquisition instead of the newest click', renewed?.clickId === click.click.id)
  const refund = await fact('CANCELLATION', 'subscription_refunded', '-3.00', original)
  await allocateCreatorBillingEvent(refund)
  const reversed = await db.query.creatorAttributionEvents.findFirst({ where: sql`${schema.creatorAttributionEvents.metadata}->>'billingEventId' = ${refund.id}` })
  check('partial refund inherits attribution and preserves its exact reversal', reversed?.clickId === click.click.id && reversed.amountCents === -300)
  const old = await fact('INITIAL_PURCHASE', 'subscription_started', '9.99', id(), otherBuyer, new Date(Date.now()-3600000))
  await associateMobileCreatorAttribution({ token: later.token, mobileInstallId: `mob_${id()}`, userId: otherBuyer })
  check('post-purchase code cannot retroactively seize acquisition', await allocateCreatorBillingEvent(old) === 'no_eligible_touch')
  const pending = await fact('INITIAL_PURCHASE', 'subscription_started', '9.99', id())
  const deferred = await reconcileCreatorBilling(100, 0)
  check('reconciliation respects its runtime budget without losing pending facts', deferred.deferred > 0 && (await db.query.subscriptionEvents.findFirst({ where: eq(schema.subscriptionEvents.id, pending.id) }))?.creatorAttributionStatus === 'pending')
  const result = await reconcileCreatorBilling()
  check('background reconciliation allocates durable pending facts', result.allocated >= 1 && (await db.query.subscriptionEvents.findFirst({ where: eq(schema.subscriptionEvents.id, pending.id) }))?.creatorAttributionStatus === 'allocated')
  const coverage = await getCreatorCoverage()
  check('post-level coverage traces verified payments back to the exact registered post', coverage.posts.some(row => row.id === post.id && Number(row.payments) >= 2))
  check('web billing and creator projection reconcile exact money', Number(coverage.totals.usd_net_cents) >= 1698)
  check('signed click is stable across recovery', signClickId(click.click.id) === click.token)
  const campaignToken = new URL(click.link.iosAppStoreUrl).searchParams.get('ct')!
  const csv = `date,campaign,territory,downloads,sales,currency\n2026-10-21,${campaignToken},US,suppressed,9.99,USD\n2026-10-21,${campaignToken},FR,5,8.99,EUR`
  await importStoreCampaignCsv(csv); await importStoreCampaignCsv(csv)
  const aggregates = await db.query.creatorStoreCampaignMetrics.findMany({ where: eq(schema.creatorStoreCampaignMetrics.campaign, campaignToken) })
  check('native campaign import is idempotent and preserves suppression and currency', aggregates.length === 2 && aggregates.find(row => row.currency === 'USD')?.downloads === null && aggregates.some(row => row.currency === 'EUR'))
  console.log(`${passed} creator continuity integration checks passed`)
} finally {
  // This database contains only local fixtures. Keep schema and remove this run’s ownership tree.
  await db.delete(schema.subscriptionEvents).where(sql`${schema.subscriptionEvents.accountId} in (${buyer},${otherBuyer})`)
  await db.delete(schema.creatorStoreCampaignMetrics).where(sql`${schema.creatorStoreCampaignMetrics.trackingLinkId} in (select id from creator_tracking_links where social_account_id=${account})`)
  await db.delete(schema.creatorTrackingLinks).where(eq(schema.creatorTrackingLinks.socialAccountId, account))
  await db.delete(schema.users).where(sql`${schema.users.id} in (${owner},${buyer},${otherBuyer})`)
  await db.delete(schema.creatorSprints).where(eq(schema.creatorSprints.id, campaign))
  await (globalThis as typeof globalThis & { postgresClient?: { end: () => Promise<void> } }).postgresClient?.end()
}
