import { lockCampaignBudget } from './campaign-budget-service'
import { campaignBonusCommittedCents } from './campaign-accounting'
import { bonusTargetPayments } from './bonus-payments'
import { createHash } from 'node:crypto'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { campaignBonusTargets, AUDIENCE_BONUS_MAX_CLAIMS, type CampaignBonusProgress } from './campaign-bonuses'
import { getCreatorConversionReport } from './conversion-service'
import { referralPlacementEvidence } from './referral-placement'
import { hasLaunchCampaignBonuses, launchCampaign } from './campaign-launch'

function placementRevision(post: { updatedAt: Date; caption: string | null }) {
  return `${post.updatedAt.toISOString()}:${createHash('sha256').update(post.caption ?? '').digest('hex')}`
}

export async function syncCreatorCampaignBonuses(creatorProfileId: string, deadline = Date.now() + 20_000) {
  const owner = await db.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, creatorProfileId) })
  if (!owner || owner.authStatus === 'suspended') return 0
  const report = await getCreatorConversionReport(owner.userId)
  return db.transaction(async tx => {
    // One lock covers all of this creator's awards, including the five-claim cap.
    const [profile] = await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, creatorProfileId)).for('update')
    if (!profile || profile.authStatus === 'suspended') return 0
    const posts = await tx.query.creatorSubmissions.findMany({ where: and(eq(schema.creatorSubmissions.creatorProfileId, profile.id), eq(schema.creatorSubmissions.isDraft, false)), orderBy: [asc(schema.creatorSubmissions.createdAt), asc(schema.creatorSubmissions.id)] })
    const transferred = await tx.execute<{ submission_id: string }>(sql`select t.submission_id from creator_campaign_transfers t join creator_submissions s on s.id = t.submission_id where s.creator_profile_id = ${profile.id}`)
    const transferredIds = new Set(transferred.map(row => row.submission_id))
    const campaignIds = [...new Set(posts.flatMap(post => post.sprintId ? [post.sprintId] : []))]
    const campaigns = campaignIds.length ? await tx.query.creatorSprints.findMany({ where: inArray(schema.creatorSprints.id, campaignIds), orderBy: [asc(schema.creatorSprints.id)] }) : []
    const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.creatorProfileId, profile.id) })
    const accounts = await tx.query.creatorSocialAccounts.findMany({ where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id), with: { trackingLink: true } })
    // Verify referral placement before acquiring campaign locks. Cache both
    // positive and negative results, checking the oldest unknown posts first.
    // This bounds network work and prevents one inaccessible profile starving
    // later posts or holding a campaign's financial lock during an HTTP fetch.
    const placementCandidates = posts.filter(post => {
      const campaign = campaigns.find(campaign => campaign.id === post.sprintId)
      if (!campaign || !launchCampaign(campaign.terms) || !campaign.terms.bonusBudgetCents || campaign.status === 'draft' || campaign.startsAt.getTime() > Date.now() || !['approved', 'paid'].includes(post.status)) return false
      const metrics = report.videos.find(video => video.id === post.id)
      const prior = bonusTargetPayments(payments, `conversion:${post.id}`, campaign.id).reduce((sum, payment) => sum + payment.amountCents, 0)
      return metrics && metrics.paidAmountCents > 0 && metrics.direct.revenueCents >= metrics.paidAmountCents * 1.5 && Math.round(metrics.direct.revenueCents * 0.05) > prior
    }).sort((a, b) => Date.parse(a.bonusPlacement?.checkedAt ?? '1970-01-01') - Date.parse(b.bonusPlacement?.checkedAt ?? '1970-01-01'))
    for (const post of placementCandidates) {
      if (Date.now() + 6_000 > deadline) break
      const account = accounts.find(account => account.id === post.socialAccountId && account.status === 'approved')
      const link = account?.trackingLink ?? accounts.find(other => other.status === 'approved' && other.handle === account?.handle && other.trackingLink?.isActive)?.trackingLink
      if (!account || !link?.isActive) continue
      const cached = post.bonusPlacement
      if (cached && cached.linkId === link.id && cached.publicUrl === link.publicUrl && cached.revision === placementRevision(post) && Date.parse(cached.checkedAt) > Date.now() - 15 * 60_000) continue
      post.bonusPlacement = { ...await referralPlacementEvidence(account, link, post), checkedAt: new Date().toISOString(), linkId: link.id, publicUrl: link.publicUrl, revision: placementRevision(post) }
      await tx.update(schema.creatorSubmissions).set({ bonusPlacement: post.bonusPlacement }).where(eq(schema.creatorSubmissions.id, post.id))
    }
    let audienceAwards = payments.filter(payment => payment.bonusKey?.startsWith('audience:') && payment.status !== 'cancelled').length
    let created = 0
    for (const campaign of [...campaigns].sort((a, b) => (a.budgetPoolId ?? a.id).localeCompare(b.budgetPoolId ?? b.id))) {
      if (Date.now() >= deadline) break
      if (!launchCampaign(campaign.terms) || !campaign.terms.bonusBudgetCents || campaign.status === 'draft' || campaign.startsAt.getTime() > Date.now()) continue
      const owner = await lockCampaignBudget(tx, campaign.id)
      const budget = owner.terms.bonusBudgetCents ?? 0
      const [committed] = await tx.execute<{ cents: number }>(sql`select ${campaignBonusCommittedCents(campaign.id)} as cents`)
      let remaining = budget - committed.cents
      const approved = posts.filter(post => hasLaunchCampaignBonuses(post) && post.sprintId === campaign.id && ['approved', 'paid'].includes(post.status) && (post.approvedAmountCents ?? 0) > 0)
      const periodPosts = posts.filter(post => hasLaunchCampaignBonuses(post) && (post.createdAt >= campaign.startsAt || transferredIds.has(post.id)) && post.createdAt < campaign.endsAt)
      const bioLinkVerified = campaign.endsAt.getTime() <= Date.now() && periodPosts.length > 0 && periodPosts.every(post => post.exclusivityConfirmed)
      const conversions = new Map<string, NonNullable<CampaignBonusProgress['conversions']>>()
      for (const post of approved) {
        const metrics = report.videos.find(video => video.id === post.id)
        const evidence = post.bonusPlacement
        if (!metrics || !evidence || evidence.revision !== placementRevision(post) || Date.parse(evidence.checkedAt) <= Date.now() - 15 * 60_000) continue
        const account = accounts.find(account => account.id === post.socialAccountId && account.status === 'approved')
        const link = account?.trackingLink ?? accounts.find(other => other.status === 'approved' && other.handle === account?.handle && other.trackingLink?.isActive)?.trackingLink
        if (!link?.isActive || evidence.linkId !== link.id || evidence.publicUrl !== link.publicUrl) continue
        conversions.set(post.id, { revenueCents: metrics.direct.revenueCents, paidAmountCents: metrics.paidAmountCents, ...evidence })
      }
      for (const target of campaignBonusTargets(approved, bioLinkVerified, conversions)) {
        const prior = bonusTargetPayments(payments, target.subject, campaign.id)
        // A manual cancellation is not undone by the next reconciliation.
        const awarded = prior.reduce((sum, payment) => sum + payment.amountCents, 0)
        const increment = target.cents - awarded
        if (increment <= 0 || increment > remaining) continue
        const audience = target.subject.startsWith('audience:')
        if (audience && audienceAwards >= AUDIENCE_BONUS_MAX_CLAIMS) continue
        const [payment] = await tx.insert(schema.creatorPayments).values({
          creatorProfileId: profile.id, submissionId: null, bonusSprintId: campaign.id,
          bonusKey: `${target.subject}:${target.cents}`, bonusNote: `${target.label} · ${campaign.name}`,
          amountCents: increment, currency: 'USD', status: 'pending', paymentOption: profile.paymentOption,
        }).onConflictDoNothing().returning()
        if (payment) { payments.push(payment); remaining -= increment; created++; if (audience) audienceAwards++ }
      }
    }
    await tx.update(schema.creatorProfiles).set({ bonusCheckedAt: new Date() }).where(eq(schema.creatorProfiles.id, profile.id))
    return created
  })
}

export async function refreshCreatorBonuses(creatorProfileId: string) {
  try { return await syncCreatorCampaignBonuses(creatorProfileId) }
  catch (error) { console.error('creator_bonus_accrual_failed', { creatorProfileId, error }); return 0 }
}

export async function reconcileCreatorBonuses(limit = 100, timeBudgetMs = 20_000) {
  const deadline = Date.now() + timeBudgetMs
  const rows = await db.select({ id: schema.creatorProfiles.id }).from(schema.creatorProfiles).where(sql`exists (
    select 1 from creator_submissions s join creator_sprints c on c.id = s.sprint_id
    where s.creator_profile_id = ${schema.creatorProfiles.id} and not s.is_draft and coalesce((c.terms->>'bonusBudgetCents')::int, 0) > 0
  )`).orderBy(sql`${schema.creatorProfiles.bonusCheckedAt} asc nulls first`, schema.creatorProfiles.id).limit(limit)
  let checked = 0, created = 0
  for (const row of rows) {
    if (Date.now() >= deadline) break
    try { created += await syncCreatorCampaignBonuses(row.id, deadline); checked++ }
    catch (error) { console.error('creator_bonus_reconciliation_failed', { creatorProfileId: row.id, error }) }
  }
  return { checked, created, remaining: rows.length - checked }
}
