import assert from 'node:assert/strict'
import { and, eq, inArray, sql } from 'drizzle-orm'

const target = process.env.CREATOR_TEST_DATABASE_URL
if (!target) throw new Error('Set CREATOR_TEST_DATABASE_URL to the isolated creator_continuity_test database')
const url = new URL(target)
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/creator_continuity_test') throw new Error('Only the isolated local creator test database is allowed')
process.env.DATABASE_URL = target
const { db, schema } = await import('../../lib/db')
const { syncCreatorCampaignBonuses } = await import('../../lib/creator/bonus-service')
const { LAUNCH_CAMPAIGNS, launchCampaignTerms, LAUNCH_CONTENT_BUDGET_CENTS } = await import('../../lib/creator/campaign-launch')
const { creatorMoneySummary } = await import('../../lib/creator/money')
const { requestBundledPayout, settleBundledPayout } = await import('../../lib/creator/bundled-payouts')
const { reviewCreatorResource } = await import('../../lib/admin/creator-service')
const { listCreatorSprints, saveCreatorSprint } = await import('../../lib/creator/sprint-service')
const { createCreatorSubmission, saveCreatorProfile } = await import('../../lib/creator/service')
const { defaultCreatorSprintTerms } = await import('../../lib/creator/sprint-defaults')
const users: string[] = [], campaigns: string[] = []
let checks = 0
function check(message: string, value: unknown) { assert.ok(value, message); checks++; console.log(`PASS ${message}`) }
const [migration] = await db.$client<{ exists: boolean }[]>`select exists(select 1 from information_schema.columns where table_name='creator_payments' and column_name='bonus_sprint_id')`
if (!migration.exists) await db.$client.unsafe(await Bun.file(new URL('../../drizzle/0058_creator_bonus_budgets.sql', import.meta.url)).text())
else await db.$client.unsafe('ALTER TABLE creator_submissions ADD COLUMN IF NOT EXISTS bonus_placement jsonb')

async function creator() {
  const [user] = await db.insert(schema.users).values({ email: `${crypto.randomUUID()}@bonus.test` }).returning()
  users.push(user.id)
  const [profile] = await db.insert(schema.creatorProfiles).values({ userId: user.id, displayName: 'Local bonus test', authStatus: 'verified', paypalEmail: 'test@bonus.test', bundledPayouts: true }).returning()
  return { user, profile }
}
async function campaign() {
  const [row] = await db.insert(schema.creatorSprints).values({ name: 'Local launch fixture', description: 'Local only', status: 'published', budgetCents: LAUNCH_CONTENT_BUDGET_CENTS, terms: launchCampaignTerms(LAUNCH_CAMPAIGNS[0]), startsAt: new Date(Date.now() - 29 * 86_400_000), endsAt: new Date(Date.now() + 86_400_000) }).returning()
  campaigns.push(row.id)
  return row
}
async function post(profileId: string, sprint: Awaited<ReturnType<typeof campaign>>, views = 125_000, amount = 10_000) {
  const [row] = await db.insert(schema.creatorSubmissions).values({ creatorProfileId: profileId, sprintId: sprint.id, sprintTerms: sprint.terms, formatId: sprint.terms.formats[0].id, title: 'Approved local metrics', platform: 'TikTok', status: 'approved', approvedAmountCents: amount, adminViewCountThreshold: views, adminUsAudiencePercent: 47, createdAt: new Date(Date.now() - 3_600_000) }).returning()
  return row
}
const payments = (profileId: string) => db.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.creatorProfileId, profileId) })
try {
  const own = await creator(), sprint = await campaign(), first = await post(own.profile.id, sprint)
  const upcoming = await campaign()
  await db.update(schema.creatorSprints).set({ startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 31 * 86_400_000) }).where(eq(schema.creatorSprints.id, upcoming.id))
  const attempted = { sprintId: upcoming.id, formatId: upcoming.terms.formats[0].id, requirementsConfirmed: true as const, postUrl: 'https://www.tiktok.com/@local/video/123456789', analyticsVideoUrl: '/test.mp4', analyticsPhysicalRecordingConfirmed: true as const, analyticsStorageKey: 'test', analyticsContentType: 'video/mp4' as const, analyticsSizeBytes: 100, viewCountThreshold: 5000, usAudiencePercent: 40 }
  await assert.rejects(() => createCreatorSubmission(own.user.id, attempted), /Choose an active campaign/)
  check('server rejects direct submissions to upcoming campaigns', true)
  const legacyCampaign = await campaign()
  await db.update(schema.creatorSprints).set({ terms: defaultCreatorSprintTerms() }).where(eq(schema.creatorSprints.id, legacyCampaign.id))
  await assert.rejects(() => createCreatorSubmission(own.user.id, { ...attempted, sprintId: legacyCampaign.id, viewCountThreshold: 19999 }), /20,000 views/)
  check('existing campaigns retain the 20000-view server minimum', true)
  await db.update(schema.creatorSubmissions).set({ status: 'in_review' }).where(eq(schema.creatorSubmissions.id, first.id))
  check('submitted or unapproved metrics cannot create bonuses', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  await db.update(schema.creatorSubmissions).set({ status: 'approved' }).where(eq(schema.creatorSubmissions.id, first.id))
  check('first approved audience milestone creates one outstanding bonus', await syncCreatorCampaignBonuses(own.profile.id) === 1)
  check('repeat evaluation cannot create another award', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  check('concurrent evaluations cannot create duplicate awards', (await Promise.all([syncCreatorCampaignBonuses(own.profile.id), syncCreatorCampaignBonuses(own.profile.id)])).every(value => value === 0))
  let rows = await payments(own.profile.id)
  check('bonus is separate from the content submission payment', rows.length === 1 && rows[0].submissionId === null && rows[0].bonusSprintId === sprint.id && rows[0].amountCents === 1_000)
  check('creator balance includes content and bonus once', creatorMoneySummary([first] as never, rows as never).balanceCents === 11_000)
  const bundle = await requestBundledPayout(own.user.id, 11_000)
  check('content and bonus join one existing payout bundle', bundle.amountCents === 11_000 && (await payments(own.profile.id)).filter(payment => payment.payoutRequestId === bundle.id).length === 2)
  await settleBundledPayout({ id: bundle.id, expectedAmountCents: 11_000 })
  await settleBundledPayout({ id: bundle.id, expectedAmountCents: 11_000 })
  rows = await payments(own.profile.id)
  check('settling twice pays the content and bonus only once', creatorMoneySummary([first] as never, rows as never).totalPaidCents === 11_000 && rows.length === 2)
  check('settled bonus cannot accrue again', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  const budget = (await listCreatorSprints(true)).find(item => item.id === sprint.id)!
  check('content commitments and cashouts use the content pool', budget.usedCents === 10_000 && budget.paidCents === 10_000)
  check('bonus commitments and cashouts use only the bonus pool', budget.bonusUsedCents === 1_000 && budget.bonusPaidCents === 1_000 && budget.budgetCents === 250_000 && budget.terms.bonusBudgetCents === 50_000)
  for (let i = 0; i < 9; i++) await post(own.profile.id, sprint, 1_000_000)
  await db.update(schema.creatorSubmissions).set({ adminViewCountThreshold: 1_000_000 }).where(eq(schema.creatorSubmissions.id, first.id))
  await syncCreatorCampaignBonuses(own.profile.id)
  rows = await payments(own.profile.id)
  check('audience awards have a five-claim creator cap', rows.filter(payment => payment.bonusKey?.startsWith('audience:')).length === 5)
  check('million and decimillion awards are each issued once', rows.filter(payment => payment.bonusKey === 'million:1500').length === 1 && rows.filter(payment => payment.bonusKey === 'decimillion:3000').length === 1)
  await syncCreatorCampaignBonuses(own.profile.id)
  check('one-time awards do not repeat on later reviews', (await payments(own.profile.id)).length === rows.length)
  await db.update(schema.creatorSubmissions).set({ exclusivityConfirmed: true }).where(eq(schema.creatorSubmissions.creatorProfileId, own.profile.id))
  check('exclusivity cannot accrue before the campaign ends', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  await db.update(schema.creatorSprints).set({ endsAt: new Date(Date.now() - 60_000) }).where(eq(schema.creatorSprints.id, sprint.id))
  await db.update(schema.creatorSubmissions).set({ exclusivityConfirmed: false }).where(eq(schema.creatorSubmissions.id, first.id))
  check('one unchecked submission blocks the month exclusivity award', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  await db.update(schema.creatorSubmissions).set({ exclusivityConfirmed: true }).where(eq(schema.creatorSubmissions.id, first.id))
  const parallelCampaign = await campaign()
  const unchecked = await post(own.profile.id, parallelCampaign)
  await db.update(schema.creatorSubmissions).set({ status: 'pending' }).where(eq(schema.creatorSubmissions.id, unchecked.id))
  check('unchecked submissions from another campaign in the same period block exclusivity', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  const legacyPost = await post(own.profile.id, sprint)
  await db.update(schema.creatorSubmissions).set({ sprintId: null, sprintTerms: null, exclusivityConfirmed: false }).where(eq(schema.creatorSubmissions.id, legacyPost.id))
  await assert.rejects(() => reviewCreatorResource({ resource: 'exclusivity', id: legacyPost.id, confirmed: true }))
  check('admin exclusivity review rejects legacy submissions', (await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, legacyPost.id) }))?.exclusivityConfirmed === false)
  await db.update(schema.creatorSubmissions).set({ exclusivityConfirmed: true }).where(eq(schema.creatorSubmissions.id, unchecked.id))
  check('only new campaign submissions count toward exclusivity; unchecked legacy posts are excluded', await syncCreatorCampaignBonuses(own.profile.id) === 10)
  check('exclusivity cannot be paid twice', await syncCreatorCampaignBonuses(own.profile.id) === 0)
  await assert.rejects(() => reviewCreatorResource({ resource: 'exclusivity', id: first.id, confirmed: false }))
  check('approved monthly exclusivity evidence cannot silently be revoked after awards', (await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, first.id) }))?.exclusivityConfirmed === true)

  const conversionOwner = await creator(), conversionCampaign = await campaign()
  const conversionPost = await post(conversionOwner.profile.id, conversionCampaign)
  const handle = `bonus_${conversionOwner.profile.id.slice(0, 8)}`
  const publicUrl = `https://www.mogging.com/r/${handle}`
  const [account] = await db.insert(schema.creatorSocialAccounts).values({ creatorProfileId: conversionOwner.profile.id, platform: 'tiktok', handle, status: 'approved', oauthProfile: { uniqueId: handle, signature: publicUrl } }).returning()
  const [link] = await db.insert(schema.creatorTrackingLinks).values({ socialAccountId: account.id, slug: `mogging-${handle}`, publicUrl, deepLinkBaseUrl: 'mogging://r', iosAppStoreUrl: 'https://apps.apple.com' }).returning()
  await db.update(schema.creatorSubmissions).set({ socialAccountId: account.id, caption: `Try mogging-${handle}` }).where(eq(schema.creatorSubmissions.id, conversionPost.id))
  await db.insert(schema.creatorPayments).values({ creatorProfileId: conversionOwner.profile.id, submissionId: conversionPost.id, amountCents: 10_000, status: 'paid', paymentOption: 'paypal', paidAt: new Date() })
  const [click] = await db.insert(schema.creatorAttributionClicks).values({ trackingLinkId: link.id, submissionId: conversionPost.id }).returning()
  const revenue = async (clickId: string, amountCents: number) => db.insert(schema.creatorAttributionEvents).values({ trackingLinkId: link.id, clickId, eventType: 'payment', amountCents, currency: 'USD', attributionKey: 'bonus-buyer', dedupeKey: crypto.randomUUID(), metadata: { environment: 'production' } })
  await revenue(click.id, 15_000)
  await syncCreatorCampaignBonuses(conversionOwner.profile.id)
  let commissions = (await payments(conversionOwner.profile.id)).filter(payment => payment.bonusKey?.startsWith('conversion:'))
  check('verified revenue at 150% creates the exact five-percent commission', commissions.length === 1 && commissions[0].amountCents === 750)
  await revenue(click.id, 5_000)
  await syncCreatorCampaignBonuses(conversionOwner.profile.id)
  commissions = (await payments(conversionOwner.profile.id)).filter(payment => payment.bonusKey?.startsWith('conversion:'))
  check('later verified revenue accrues only the incremental commission', commissions.length === 2 && commissions.reduce((sum, payment) => sum + payment.amountCents, 0) === 1_000)
  await syncCreatorCampaignBonuses(conversionOwner.profile.id)
  check('reconciliation cannot duplicate commission increments', (await payments(conversionOwner.profile.id)).filter(payment => payment.bonusKey?.startsWith('conversion:')).length === 2)
  const [shared] = await db.insert(schema.creatorAttributionClicks).values({ trackingLinkId: link.id }).returning()
  await revenue(shared.id, 100_000)
  await syncCreatorCampaignBonuses(conversionOwner.profile.id)
  check('estimated shared-link revenue cannot create financial commission', (await payments(conversionOwner.profile.id)).filter(payment => payment.bonusKey?.startsWith('conversion:')).reduce((sum, payment) => sum + payment.amountCents, 0) === 1_000)
  await db.update(schema.creatorSubmissions).set({ caption: 'Missing the referral code' }).where(eq(schema.creatorSubmissions.id, conversionPost.id))
  await revenue(click.id, 5_000)
  await syncCreatorCampaignBonuses(conversionOwner.profile.id)
  check('a missing caption code blocks new conversion commission', (await payments(conversionOwner.profile.id)).filter(payment => payment.bonusKey?.startsWith('conversion:')).reduce((sum, payment) => sum + payment.amountCents, 0) === 1_000)
  await db.delete(schema.creatorTrackingLinks).where(eq(schema.creatorTrackingLinks.id, link.id))

  const cap = await campaign(), a = await creator(), b = await creator()
  await db.update(schema.creatorSprints).set({ terms: { ...cap.terms, bonusBudgetCents: 1_000 } }).where(eq(schema.creatorSprints.id, cap.id))
  await post(a.profile.id, cap); await post(b.profile.id, cap)
  check('concurrent creators cannot overspend the same bonus budget', (await Promise.all([syncCreatorCampaignBonuses(a.profile.id), syncCreatorCampaignBonuses(b.profile.id)])).reduce((sum, value) => sum + value, 0) === 1)
  await assert.rejects(() => db.insert(schema.creatorPayments).values({ creatorProfileId: a.profile.id, bonusSprintId: cap.id, bonusKey: 'forged:1', bonusNote: 'Over budget', amountCents: 1, paymentOption: 'paypal' }))
  check('database enforces the bonus budget on every payment path', true)
  await assert.rejects(() => db.update(schema.creatorSprints).set({ terms: { ...cap.terms, bonusBudgetCents: 999 } }).where(eq(schema.creatorSprints.id, cap.id)))
  check('a budget cannot be reduced below approved bonus commitments', true)
  const winner = (await payments(a.profile.id))[0] ?? (await payments(b.profile.id))[0]
  const winnerOwner = winner.creatorProfileId === a.profile.id ? a : b
  await saveCreatorProfile(winnerOwner.user.id, { displayName: 'Local bonus test', paymentOption: 'crypto', cryptoNetwork: 'base', cryptoWalletAddress: `0x${'1'.repeat(40)}` })
  check('unrequested automatic bonuses follow the new payout method', (await payments(winnerOwner.profile.id))[0].paymentOption === 'crypto')
  await saveCreatorProfile(own.user.id, { displayName: 'Local bonus test', paymentOption: 'crypto', cryptoNetwork: 'base', cryptoWalletAddress: `0x${'1'.repeat(40)}` })
  check('changing payout method preserves already paid bonus destinations', (await payments(own.profile.id)).find(payment => payment.bonusKey?.startsWith('audience:') && payment.status === 'paid')?.paymentOption === 'paypal')
  await assert.rejects(() => db.update(schema.creatorPayments).set({ amountCents: 2_000 }).where(eq(schema.creatorPayments.id, winner.id)))
  check('automatic award amount and identity cannot be rewritten', true)
  const saved = await saveCreatorSprint({ name: 'New launch defaults', description: 'Local only', status: 'draft', budgetCents: 999_999, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), terms: cap.terms })
  campaigns.push(saved.id)
  check('new launch campaigns persist exactly $2500 content and $500 bonuses', saved.budgetCents === 250_000 && saved.terms.bonusBudgetCents === 50_000)
  console.log(`${checks} automatic bonus accounting integration checks passed`)
} finally {
  if (users.length) {
    const profiles = await db.query.creatorProfiles.findMany({ where: inArray(schema.creatorProfiles.userId, users) })
    const accounts = await db.query.creatorSocialAccounts.findMany({ where: inArray(schema.creatorSocialAccounts.creatorProfileId, profiles.map(profile => profile.id)) })
    const links = accounts.length ? await db.query.creatorTrackingLinks.findMany({ where: inArray(schema.creatorTrackingLinks.socialAccountId, accounts.map(account => account.id)) }) : []
    if (links.length) {
      await db.delete(schema.creatorAttributionEvents).where(inArray(schema.creatorAttributionEvents.trackingLinkId, links.map(link => link.id)))
      await db.delete(schema.creatorAttributionClicks).where(inArray(schema.creatorAttributionClicks.trackingLinkId, links.map(link => link.id)))
      await db.delete(schema.creatorTrackingLinks).where(inArray(schema.creatorTrackingLinks.id, links.map(link => link.id)))
    }
    await db.delete(schema.creatorPayments).where(inArray(schema.creatorPayments.creatorProfileId, profiles.map(profile => profile.id)))
    await db.delete(schema.creatorPayoutRequests).where(inArray(schema.creatorPayoutRequests.creatorProfileId, profiles.map(profile => profile.id)))
    await db.delete(schema.users).where(inArray(schema.users.id, users))
  }
  if (campaigns.length) await db.delete(schema.creatorSprints).where(inArray(schema.creatorSprints.id, campaigns))
  await db.$client.end()
}
