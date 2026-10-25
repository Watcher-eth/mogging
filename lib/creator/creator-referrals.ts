import { randomBytes } from 'node:crypto'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { siteUrl } from '@/lib/seo'
import { creatorReferralCents, CREATOR_REFERRAL_VIDEO_LIMIT, type CreatorReferralReport } from './creator-referral-policy'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

function sharedReferralIdentity(inviter: typeof schema.creatorProfiles.$inferSelect, invitee: typeof schema.creatorProfiles.$inferSelect, accounts: Array<typeof schema.creatorSocialAccounts.$inferSelect>) {
  const samePayPal = inviter.paypalEmail && invitee.paypalEmail && inviter.paypalEmail.trim().toLowerCase() === invitee.paypalEmail.trim().toLowerCase()
  const network = (inviter.cryptoNetwork || '').toLowerCase()
  const wallet = (value: string) => /ethereum|polygon|arbitrum|base|evm|bsc/.test(network) ? value.trim().toLowerCase() : value.trim()
  const sameWallet = inviter.cryptoWalletAddress && invitee.cryptoWalletAddress && wallet(inviter.cryptoWalletAddress) === wallet(invitee.cryptoWalletAddress) && network === (invitee.cryptoNetwork || '').toLowerCase()
  const sameAccount = accounts.some(a => a.creatorProfileId === inviter.id && accounts.some(b => b.creatorProfileId === invitee.id && a.platform === b.platform && ((a.providerAccountId && a.providerAccountId === b.providerAccountId) || (a.handle && b.handle && a.handle.toLowerCase() === b.handle.toLowerCase()))))
  return Boolean(samePayPal || sameWallet || sameAccount)
}

// Recheck eligibility at cashout, including awards earned before an identity or suspension changed.
export async function assertCreatorReferralPaymentsEligible(tx: Transaction, payments: Array<{ creatorReferralAwardId?: string | null }>) {
  const ids = payments.flatMap(payment => payment.creatorReferralAwardId ? [payment.creatorReferralAwardId] : [])
  if (!ids.length) return
  const awards = await tx.query.creatorReferralAwards.findMany({ where: inArray(schema.creatorReferralAwards.id, ids) })
  for (const inviteeId of new Set(awards.map(award => award.inviteeId))) {
    const referral = await tx.query.creatorReferrals.findFirst({ where: eq(schema.creatorReferrals.inviteeId, inviteeId) })
    if (!referral || referral.blockedReason) throw new ApiError(409, 'Creator referral bonus eligibility needs admin review')
    const profiles = await tx.query.creatorProfiles.findMany({ where: inArray(schema.creatorProfiles.id, [referral.inviterId, inviteeId]) })
    const inviter = profiles.find(profile => profile.id === referral.inviterId)
    const invitee = profiles.find(profile => profile.id === inviteeId)
    const accounts = await tx.query.creatorSocialAccounts.findMany({ where: inArray(schema.creatorSocialAccounts.creatorProfileId, profiles.map(profile => profile.id)) })
    if (!inviter || !invitee || profiles.some(profile => profile.authStatus === 'suspended') || sharedReferralIdentity(inviter, invitee, accounts)) throw new ApiError(409, 'Creator referral bonus eligibility needs admin review')
  }
}

// Called only inside the creator registration transaction, never for an existing profile.
export async function attributeNewCreator(tx: Transaction, invitee: typeof schema.creatorProfiles.$inferSelect, code?: string | null) {
  if (!code) return
  const link = await tx.query.creatorReferralLinks.findFirst({ where: eq(schema.creatorReferralLinks.code, code) })
  if (!link || link.creatorProfileId === invitee.id) return
  const inviter = await tx.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, link.creatorProfileId) })
  if (!inviter || inviter.userId === invitee.userId || inviter.authStatus === 'suspended') return
  await tx.insert(schema.creatorReferrals).values({ inviteeId: invitee.id, inviterId: inviter.id }).onConflictDoNothing()
}

// Approval order is durable: rereviews never occupy another slot or replace a prior video.
export async function reserveCreatorReferralVideo(tx: Transaction, submissionId: string) {
  const post = await tx.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, submissionId) })
  if (!post || post.isDraft || !['approved', 'paid'].includes(post.status)) return
  const [referral] = await tx.select().from(schema.creatorReferrals).where(eq(schema.creatorReferrals.inviteeId, post.creatorProfileId)).for('update')
  if (!referral || post.createdAt < referral.createdAt) return
  const awards = await tx.query.creatorReferralAwards.findMany({ where: eq(schema.creatorReferralAwards.inviteeId, referral.inviteeId) })
  if (awards.some(award => award.submissionId === post.id) || awards.length >= CREATOR_REFERRAL_VIDEO_LIMIT) return
  await tx.insert(schema.creatorReferralAwards).values({ inviteeId: referral.inviteeId, submissionId: post.id, slot: awards.length + 1 }).onConflictDoNothing()
}

export async function syncCreatorReferralBonuses(inviteeId: string) {
  const attribution = await db.query.creatorReferrals.findFirst({ where: eq(schema.creatorReferrals.inviteeId, inviteeId) })
  if (!attribution) return 0
  return db.transaction(async tx => {
    const profiles = await tx.select().from(schema.creatorProfiles).where(inArray(schema.creatorProfiles.id, [attribution.inviterId, inviteeId])).orderBy(asc(schema.creatorProfiles.id)).for('update')
    const [referral] = await tx.select().from(schema.creatorReferrals).where(eq(schema.creatorReferrals.inviteeId, inviteeId)).for('update')
    const inviter = profiles.find(profile => profile.id === referral.inviterId)
    const invitee = profiles.find(profile => profile.id === inviteeId)
    await tx.update(schema.creatorReferrals).set({ checkedAt: new Date() }).where(eq(schema.creatorReferrals.inviteeId, inviteeId))
    if (!inviter || !invitee || referral.blockedReason || profiles.some(profile => profile.authStatus === 'suspended')) return 0
    // Separate logins sharing a payout identity do not automatically qualify as independent creators.
    const accounts = await tx.query.creatorSocialAccounts.findMany({ where: inArray(schema.creatorSocialAccounts.creatorProfileId, [inviter.id, invitee.id]) })
    if (sharedReferralIdentity(inviter, invitee, accounts)) {
      await tx.update(schema.creatorReferrals).set({ blockedReason: 'Shared payout or social identity requires admin review' }).where(eq(schema.creatorReferrals.inviteeId, inviteeId))
      return 0
    }
    // No credit until the invitee has an approved social account and a completed normal post payment.
    if (!accounts.some(account => account.creatorProfileId === inviteeId && account.status === 'approved')) return 0
    const awards = await tx.query.creatorReferralAwards.findMany({ where: eq(schema.creatorReferralAwards.inviteeId, inviteeId), orderBy: [asc(schema.creatorReferralAwards.slot)] })
    const sourcePayments = await tx.query.creatorPayments.findMany({ where: and(eq(schema.creatorPayments.creatorProfileId, inviteeId), eq(schema.creatorPayments.status, 'paid'), eq(schema.creatorPayments.currency, 'USD')) })
    let created = 0
    for (const award of awards) {
      const paid = sourcePayments.filter(payment => payment.submissionId === award.submissionId && payment.paidAt && !payment.bonusSprintId && !payment.creatorReferralAwardId).reduce((sum, payment) => sum + Math.max(0, payment.amountCents), 0)
      const target = creatorReferralCents(paid)
      const increment = target - award.issuedCents
      if (increment <= 0) continue
      // Cumulative floor rounding means split/partial payouts cannot inflate the 5%.
      // Cancelled awards remain in issuedCents so a manual cancellation is never reissued.
      await tx.insert(schema.creatorPayments).values({
        creatorProfileId: inviter.id, creatorReferralAwardId: award.id,
        amountCents: increment, currency: 'USD', status: 'pending', paymentOption: inviter.paymentOption,
        bonusNote: 'Creator referral · ' + invitee.displayName + ' · video ' + award.slot + '/5',
      })
      await tx.update(schema.creatorReferralAwards).set({ issuedCents: target, paidBasisCents: paid }).where(eq(schema.creatorReferralAwards.id, award.id))
      created++
    }
    return created
  })
}

export async function refreshCreatorReferralBonuses(inviteeId: string) {
  try { return await syncCreatorReferralBonuses(inviteeId) }
  catch (error) { console.error('creator_referral_accrual_failed', { inviteeId, error }); return 0 }
}

export async function reconcileCreatorReferrals(limit = 100, timeBudgetMs = 8000) {
  const deadline = Date.now() + timeBudgetMs
  const referrals = await db.select({ id: schema.creatorReferrals.inviteeId }).from(schema.creatorReferrals).orderBy(sql`checked_at asc nulls first`, asc(schema.creatorReferrals.inviteeId)).limit(limit)
  let checked = 0, created = 0
  for (const referral of referrals) {
    if (Date.now() >= deadline) break
    created += await refreshCreatorReferralBonuses(referral.id)
    checked++
  }
  return { checked, created }
}

export async function getCreatorReferralReport(userId: string): Promise<CreatorReferralReport | null> {
  const profile = await db.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.userId, userId) })
  if (!profile || profile.authStatus === 'suspended') return null
  await db.insert(schema.creatorReferralLinks).values({ creatorProfileId: profile.id, code: randomBytes(24).toString('base64url') }).onConflictDoNothing()
  const link = await db.query.creatorReferralLinks.findFirst({ where: eq(schema.creatorReferralLinks.creatorProfileId, profile.id) })
  const referrals = await db.select({ id: schema.creatorReferrals.inviteeId, name: schema.creatorProfiles.displayName, joinedAt: schema.creatorReferrals.createdAt, blocked: schema.creatorReferrals.blockedReason, authStatus: schema.creatorProfiles.authStatus }).from(schema.creatorReferrals).innerJoin(schema.creatorProfiles, eq(schema.creatorProfiles.id, schema.creatorReferrals.inviteeId)).where(eq(schema.creatorReferrals.inviterId, profile.id)).orderBy(asc(schema.creatorReferrals.createdAt))
  const ids = referrals.map(referral => referral.id)
  const awards = ids.length ? await db.query.creatorReferralAwards.findMany({ where: inArray(schema.creatorReferralAwards.inviteeId, ids) }) : []
  const payments = awards.length ? await db.query.creatorPayments.findMany({ where: and(eq(schema.creatorPayments.creatorProfileId, profile.id), inArray(schema.creatorPayments.creatorReferralAwardId, awards.map(award => award.id))) }) : []
  const valid = payments.filter(payment => payment.status !== 'cancelled')
  const total = (rows: typeof valid) => rows.reduce((sum, payment) => sum + payment.amountCents, 0)
  return {
    inviteUrl: siteUrl + '/creator/join/' + link!.code, invited: referrals.length,
    earnedCents: total(valid), paidCents: total(valid.filter(payment => payment.status === 'paid')),
    outstandingCents: total(valid.filter(payment => payment.status !== 'paid')),
    referrals: referrals.map(referral => {
      const own = awards.filter(award => award.inviteeId === referral.id)
      return { id: referral.id, name: referral.name, joinedAt: referral.joinedAt.toISOString(), approvedVideos: own.length, earnedCents: total(valid.filter(payment => own.some(award => award.id === payment.creatorReferralAwardId))), status: referral.blocked || referral.authStatus === 'suspended' ? 'on_hold' : own.length >= 5 ? 'complete' : 'active' }
    }),
  }
}
