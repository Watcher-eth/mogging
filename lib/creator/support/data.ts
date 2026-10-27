import { and, count, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { getCreatorConversionReport } from '../conversion-service'
import { conversionWindow, supportVideoAnalytics } from './video-analytics'
import { supportAnalyticsWindow } from './analytics'
import type { SupportDataSource } from './contracts'
import type { CreatorSubmission } from '@/components/creator/types'

export async function createSupportDataSource(userId: string): Promise<SupportDataSource> {
  const profile = await db.query.creatorProfiles.findFirst({ columns: { id: true, authStatus: true }, where: eq(schema.creatorProfiles.userId, userId) })
  if (!profile || profile.authStatus === 'suspended') throw new ApiError(403, 'Creator access required')
  const ownerId = profile.id
  const source: SupportDataSource = {
    async submissions({ id, status, limit = 5 }) {
      const s = schema.creatorSubmissions
      const where = and(eq(s.creatorProfileId, ownerId), eq(s.isDraft, false), id ? eq(s.id, id) : undefined, status ? eq(s.status, status) : undefined)
      const [rows, [total]] = await Promise.all([
        db.select({ id: s.id, title: s.title, caption: s.caption, platform: s.platform, postUrl: s.postUrl, socialAccountId: s.socialAccountId, sprintId: s.sprintId, approvedAmountCents: s.approvedAmountCents, status: s.status, viewCountThreshold: s.viewCountThreshold, adminViewCountThreshold: s.adminViewCountThreshold, adminUsAudiencePercent: s.adminUsAudiencePercent, formatId: s.formatId, sprintTerms: s.sprintTerms, usAudiencePercent: s.usAudiencePercent, reviewChecklist: s.reviewChecklist, reviewNote: s.reviewNote, reviewRequestedAt: s.reviewRequestedAt, createdAt: s.createdAt, updatedAt: s.updatedAt }).from(s).where(where).orderBy(desc(s.createdAt), desc(s.id)).limit(Math.min(limit, 8)),
        db.select({ value: count() }).from(s).where(where),
      ])
      const submissions: CreatorSubmission[] = rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), reviewRequestedAt: row.reviewRequestedAt?.toISOString() ?? null, requirementsConfirmedAt: null, videoUrl: null, videoContentType: null, videoSizeBytes: null, analyticsScreenshotUrl: null, analyticsContentType: null, analyticsSizeBytes: null }))
      return { submissions, total: total.value }
    },
    async history(submissionId) {
      const u = schema.creatorSubmissionUpdates, s = schema.creatorSubmissions
      const columns = { id: u.id, type: u.type, note: u.note, createdAt: u.createdAt, snapshot: u.historySnapshot }
      const owned = and(eq(s.creatorProfileId, ownerId), eq(s.id, submissionId), eq(s.isDraft, false))
      const [recent, lastApproval] = await Promise.all([
        db.select(columns).from(u).innerJoin(s, eq(s.id, u.submissionId)).where(and(owned, inArray(u.type, ['approved', 'rejected', 'rereview_requested']))).orderBy(desc(u.createdAt), desc(u.id)).limit(8),
        db.select(columns).from(u).innerJoin(s, eq(s.id, u.submissionId)).where(and(owned, eq(u.type, 'approved'))).orderBy(desc(u.createdAt), desc(u.id)).limit(1),
      ])
      return [...new Map([...recent, ...lastApproval].map(row => [row.id, row])).values()].sort((a,b) => b.createdAt.getTime() - a.createdAt.getTime()).map(row => ({ ...row, createdAt: row.createdAt.toISOString() }))
    },
    async overview() {
      const statuses = ['pending', 'in_review', 'approved', 'paid', 'rejected'] as const
      const results = await Promise.all(statuses.map(status => this.submissions({ status, limit: 2 })))
      const counts = Object.fromEntries(statuses.map((status, i) => [status, results[i].total])) as Record<typeof statuses[number], number>
      return { counts, groups: [
        { key: 'review', title: 'In review', total: counts.pending + counts.in_review, submissions: [...results[0].submissions, ...results[1].submissions] },
        { key: 'approved-paid', title: 'Approved & paid', total: counts.approved + counts.paid, submissions: [...results[2].submissions, ...results[3].submissions] },
        { key: 'rejected', title: 'Rejected', total: counts.rejected, submissions: results[4].submissions },
      ] }
    },
    async videoAnalytics(query) {
      const window = conversionWindow(query)
      const report = await getCreatorConversionReport(userId, { start: new Date(window.start), end: new Date(window.end) })
      return supportVideoAnalytics(report, window, query)
    },
    async analytics(days) {
      return supportAnalyticsWindow(await getCreatorConversionReport(userId), days)
    },
    async campaigns(id) {
      const c = schema.creatorSprints
      const rows = await db.select({ id: c.id, name: c.name, description: c.description, startsAt: c.startsAt, endsAt: c.endsAt, status: c.status, terms: c.terms }).from(c)
        .where(and(inArray(c.status, ['published', 'ended']), id ? eq(c.id, id) : undefined)).orderBy(desc(c.startsAt)).limit(id ? 1 : 6)
      return rows.map(row => ({ ...row, status: row.status as 'published' | 'ended', startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString() }))
    },
    async payments(submissionId) {
      const p = schema.creatorPayments
      const where = and(eq(p.creatorProfileId, ownerId), submissionId ? or(eq(p.submissionId, submissionId), sql`split_part(${p.bonusKey}, ':', 2) = ${submissionId} and split_part(${p.bonusKey}, ':', 1) in ('audience','exclusivity','conversion')`) : undefined)
      const [rows, [total]] = await Promise.all([
        db.select({ id: p.id, submissionId: p.submissionId, amountCents: p.amountCents, currency: p.currency, status: p.status, paidAt: p.paidAt, bonusKey: p.bonusKey }).from(p).where(where).orderBy(desc(p.createdAt)).limit(10),
        db.select({ value: count() }).from(p).where(where),
      ])
      const [summary] = submissionId ? await db.select({
        paidContentCents: sql<number>`coalesce(sum(case when ${p.submissionId} = ${submissionId} and ${p.status} = 'paid' and upper(${p.currency}) = 'USD' then ${p.amountCents} else 0 end),0)::int`,
        scheduledContentCents: sql<number>`coalesce(sum(case when ${p.submissionId} = ${submissionId} and ${p.status} in ('pending','processing') and upper(${p.currency}) = 'USD' then ${p.amountCents} else 0 end),0)::int`,
        paidBonusCents: sql<number>`coalesce(sum(case when ${p.submissionId} is null and ${p.status} = 'paid' and upper(${p.currency}) = 'USD' then ${p.amountCents} else 0 end),0)::int`,
        recordedBonusCents: sql<number>`coalesce(sum(case when ${p.submissionId} is null and ${p.status} <> 'cancelled' and upper(${p.currency}) = 'USD' then ${p.amountCents} else 0 end),0)::int`,
        nonUsdPayments: sql<number>`count(*) filter (where upper(${p.currency}) <> 'USD')::int`,
      }).from(p).where(where) : []
      return { payments: rows.map(row => ({ ...row, paidAt: row.paidAt?.toISOString() ?? null })), total: total.value, ...(summary ? { summary } : {}) }
    },
    async bonuses() {
      const p = schema.creatorPayments
      const where = and(eq(p.creatorProfileId, ownerId), isNotNull(p.bonusKey))
      const [payments, [total]] = await Promise.all([
        db.select({ id: p.id, amountCents: p.amountCents, currency: p.currency, status: p.status, bonusKey: p.bonusKey, bonusNote: p.bonusNote, bonusSprintId: p.bonusSprintId, payoutRequestId: p.payoutRequestId }).from(p).where(where).orderBy(desc(p.createdAt)).limit(10),
        db.select({ value: count() }).from(p).where(where),
      ])
      return { payments, total: total.value }
    },
    async referrals() {
      const p = schema.creatorPayments
      const [[invited], link, payments] = await Promise.all([
        db.select({ value: count() }).from(schema.creatorReferrals).where(eq(schema.creatorReferrals.inviterId, ownerId)),
        db.query.creatorReferralLinks.findFirst({ columns: { code: true }, where: eq(schema.creatorReferralLinks.creatorProfileId, ownerId) }),
        db.select({ amountCents: p.amountCents, status: p.status }).from(p).where(and(eq(p.creatorProfileId, ownerId), isNotNull(p.creatorReferralAwardId), inArray(p.status, ['pending', 'processing', 'paid', 'failed']))),
      ])
      const total = (paid: boolean) => payments.filter(p => (p.status === 'paid') === paid).reduce((sum, p) => sum + p.amountCents, 0)
      return { inviteUrl: link ? `/creator/join/${encodeURIComponent(link.code)}` : null, invited: invited.value, earnedCents: total(true) + total(false), paidCents: total(true), outstandingCents: total(false) }
    },
  }
  return source
}
