import { remainingCreatorPaymentCents } from '@/lib/creator/money'
import { submissionUnreadCount } from '@/lib/creator/submission-messages'
import { sprintPayoutCents, sprintReviewItems } from '@/lib/creator/sprints'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { ensureCreatorTrackingLink, getCreatorAttributionReport } from '@/lib/creator/attribution'
import {
  creatorSubmissionReviewResultsSchema,
  validateCreatorSubmissionReviewResults,
} from '@/lib/creator/submission-review'
import {
  calculateCreatorPayout,
  isCreatorTier1AudienceTier,
  isCreatorViewThreshold,
} from '@/lib/creator/payouts'

export const creatorAdminReviewSchema = z.discriminatedUnion('resource', [
  z.object({
    resource: z.literal('creator'),
    id: z.string().min(1),
    status: z.enum(['pending', 'verified', 'suspended']),
  }),
  z.object({
    resource: z.literal('account'),
    id: z.string().min(1),
    status: z.enum(['pending', 'approved', 'missing_information']),
    reviewNote: z.string().trim().max(1000).optional().nullable(),
  }),
  z.object({
    resource: z.literal('submission'),
    id: z.string().min(1),
    status: z.enum(['pending', 'in_review', 'approved', 'rejected', 'paid']),
    reviewNote: z.string().trim().max(1000).optional().nullable(),
    reviewChecklist: creatorSubmissionReviewResultsSchema,
    adminViewCountThreshold: z.number().int().nonnegative().max(2_000_000_000),
    adminUsAudiencePercent: z.number().min(0).max(100).nullable(),
  }),
  z.object({
    resource: z.literal('payment'),
    id: z.string().min(1),
    status: z.enum(['pending', 'processing', 'paid', 'failed', 'cancelled']),
    amountCents: z.number().int().nonnegative().optional(),
    providerReference: z.string().trim().max(180).optional().nullable(),
  }),
])

export const creatorAdminPaymentSchema = z.object({
  submissionId: z.string().min(1),
  adminViewCountThreshold: z.number().int().nonnegative().max(2_000_000_000),
  adminUsAudiencePercent: z.number().min(0).max(100).nullable(),
  status: z.enum(['pending', 'processing', 'paid', 'failed', 'cancelled']).default('pending'),
  providerReference: z.string().trim().max(180).optional().nullable(),
})

export const creatorAttributionMetricsSchema = z.object({
  postedAt: z.string().datetime().refine((value) => Date.parse(value) <= Date.now(), 'Posting date cannot be in the future').optional().nullable(),
  submissionId: z.string().min(1),
  qualifiedViews: z.number().int().nonnegative().max(2_000_000_000),
  linkClicks: z.number().int().nonnegative().max(2_000_000_000),
  installs: z.number().int().nonnegative().max(2_000_000_000),
  firstTimePaidCustomers: z.number().int().nonnegative().max(2_000_000_000),
}).superRefine((value, ctx) => {
  if (value.linkClicks > value.qualifiedViews) ctx.addIssue({ code: 'custom', path: ['linkClicks'], message: 'Link clicks cannot exceed qualified views' })
  if (value.installs > value.linkClicks) ctx.addIssue({ code: 'custom', path: ['installs'], message: 'Installs cannot exceed link clicks' })
  if (value.firstTimePaidCustomers > value.installs) ctx.addIssue({ code: 'custom', path: ['firstTimePaidCustomers'], message: 'Paid customers cannot exceed installs' })
})

export const creatorProgramSettingsSchema = z.object({
  monthlySubscriptionCents: z.number().int().positive().max(1_000_000),
  ninetyDayContributionMarginCents: z.number().int().nonnegative().max(10_000_000),
})

export const CREATOR_COMPENSATION_CAP_RATE = 0.35
export const CREATOR_CONVERSION_BONUS_CAP_RATE = 0.25

export type CreatorAdminReviewInput = z.infer<typeof creatorAdminReviewSchema>
export type CreatorAdminPaymentInput = z.infer<typeof creatorAdminPaymentSchema>

export async function getCreatorAdminDashboard() {
  const [creatorRows, accountRows, submissions, payments, attributionMetrics, settingsRecord, accountAttributionRows] = await Promise.all([
    db
      .select({
        id: schema.creatorProfiles.id,
        userId: schema.creatorProfiles.userId,
        displayName: schema.creatorProfiles.displayName,
        email: schema.users.email,
        image: schema.users.image,
        primaryContact: schema.creatorProfiles.socialHandle,
        authStatus: schema.creatorProfiles.authStatus,
        paymentOption: schema.creatorProfiles.paymentOption,
        paypalEmail: schema.creatorProfiles.paypalEmail,
        paypalMeUrl: schema.creatorProfiles.paypalMeUrl,
        cryptoNetwork: schema.creatorProfiles.cryptoNetwork,
        cryptoWalletAddress: schema.creatorProfiles.cryptoWalletAddress,
        createdAt: schema.creatorProfiles.createdAt,
      })
      .from(schema.creatorProfiles)
      .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
      .orderBy(desc(schema.creatorProfiles.createdAt)),
    db
      .select({
        id: schema.creatorSocialAccounts.id,
        creatorProfileId: schema.creatorSocialAccounts.creatorProfileId,
        creatorName: schema.creatorProfiles.displayName,
        creatorEmail: schema.users.email,
        platform: schema.creatorSocialAccounts.platform,
        handle: schema.creatorSocialAccounts.handle,
        displayName: schema.creatorSocialAccounts.displayName,
        avatarUrl: schema.creatorSocialAccounts.avatarUrl,
        profileUrl: schema.creatorSocialAccounts.profileUrl,
        connectionMethod: schema.creatorSocialAccounts.connectionMethod,
        analyticsVideoUrl: schema.creatorSocialAccounts.analyticsVideoUrl,
        analyticsContentType: schema.creatorSocialAccounts.analyticsContentType,
        analyticsSizeBytes: schema.creatorSocialAccounts.analyticsSizeBytes,
        analyticsPeriodDays: schema.creatorSocialAccounts.analyticsPeriodDays,
        analyticsConfirmedAt: schema.creatorSocialAccounts.analyticsConfirmedAt,
        status: schema.creatorSocialAccounts.status,
        reviewNote: schema.creatorSocialAccounts.reviewNote,
        trackingLinkUrl: schema.creatorTrackingLinks.publicUrl,
        trackingLinkSlug: schema.creatorTrackingLinks.slug,
        trackingLinkActive: schema.creatorTrackingLinks.isActive,
        createdAt: schema.creatorSocialAccounts.createdAt,
      })
      .from(schema.creatorSocialAccounts)
      .innerJoin(schema.creatorProfiles, eq(schema.creatorSocialAccounts.creatorProfileId, schema.creatorProfiles.id))
      .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
      .leftJoin(schema.creatorTrackingLinks, eq(schema.creatorTrackingLinks.socialAccountId, schema.creatorSocialAccounts.id))
      .orderBy(desc(schema.creatorSocialAccounts.createdAt)),
    db
      .select({
        id: schema.creatorSubmissions.id,
        unreadMessages: submissionUnreadCount('team'),
        creatorProfileId: schema.creatorSubmissions.creatorProfileId,
        creatorName: schema.creatorProfiles.displayName,
        creatorEmail: schema.users.email,
        socialAccountId: schema.creatorSubmissions.socialAccountId,
        socialHandle: schema.creatorSocialAccounts.handle,
        creatorAvatarUrl: sql<string | null>`coalesce(nullif(${schema.creatorSocialAccounts.avatarUrl}, ''), ${schema.users.image})`,
        socialAccountStatus: schema.creatorSocialAccounts.status,
        sprintId: schema.creatorSubmissions.sprintId,
        sprintTerms: schema.creatorSubmissions.sprintTerms,
        approvedAmountCents: schema.creatorSubmissions.approvedAmountCents,
        reviewRequestedAt: schema.creatorSubmissions.reviewRequestedAt,
        formatId: schema.creatorSubmissions.formatId,
        requirementsConfirmedAt: schema.creatorSubmissions.requirementsConfirmedAt,
        title: schema.creatorSubmissions.title,
        platform: schema.creatorSubmissions.platform,
        caption: schema.creatorSubmissions.caption,
        postUrl: schema.creatorSubmissions.postUrl,
        videoUrl: schema.creatorSubmissions.videoUrl,
        videoContentType: schema.creatorSubmissions.videoContentType,
        videoSizeBytes: schema.creatorSubmissions.videoSizeBytes,
        analyticsScreenshotUrl: schema.creatorSubmissions.analyticsScreenshotUrl,
        analyticsContentType: schema.creatorSubmissions.analyticsContentType,
        analyticsSizeBytes: schema.creatorSubmissions.analyticsSizeBytes,
        viewCountThreshold: schema.creatorSubmissions.viewCountThreshold,
        usAudiencePercent: schema.creatorSubmissions.usAudiencePercent,
        adminViewCountThreshold: schema.creatorSubmissions.adminViewCountThreshold,
        adminUsAudiencePercent: schema.creatorSubmissions.adminUsAudiencePercent,
        status: schema.creatorSubmissions.status,
        reviewNote: schema.creatorSubmissions.reviewNote,
        reviewChecklist: schema.creatorSubmissions.reviewChecklist,
        createdAt: schema.creatorSubmissions.createdAt,
      })
      .from(schema.creatorSubmissions)
      .innerJoin(schema.creatorProfiles, eq(schema.creatorSubmissions.creatorProfileId, schema.creatorProfiles.id))
      .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
      .leftJoin(schema.creatorSocialAccounts, eq(schema.creatorSubmissions.socialAccountId, schema.creatorSocialAccounts.id))
      .orderBy(desc(schema.creatorSubmissions.createdAt)),
    db
      .select({
        id: schema.creatorPayments.id,
        creatorProfileId: schema.creatorPayments.creatorProfileId,
        creatorName: schema.creatorProfiles.displayName,
        creatorEmail: schema.users.email,
        submissionId: schema.creatorPayments.submissionId,
        submissionTitle: schema.creatorSubmissions.title,
        amountCents: schema.creatorPayments.amountCents,
        currency: schema.creatorPayments.currency,
        status: schema.creatorPayments.status,
        paymentOption: schema.creatorPayments.paymentOption,
        providerReference: schema.creatorPayments.providerReference,
        paidAt: schema.creatorPayments.paidAt,
        createdAt: schema.creatorPayments.createdAt,
      })
      .from(schema.creatorPayments)
      .innerJoin(schema.creatorProfiles, eq(schema.creatorPayments.creatorProfileId, schema.creatorProfiles.id))
      .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
      .leftJoin(schema.creatorSubmissions, eq(schema.creatorPayments.submissionId, schema.creatorSubmissions.id))
      .orderBy(desc(schema.creatorPayments.createdAt)),
    db.query.creatorAttributionMetrics.findMany(),
    db.query.creatorProgramSettings.findFirst({
      where: eq(schema.creatorProgramSettings.id, 'default'),
    }),
    getCreatorAttributionReport(),
  ])

  const attributionByAccountId = new Map(accountAttributionRows.map((report) => [report.socialAccountId, report]))
  const accounts = await Promise.all(accountRows.map(async (account) => {
    const trackingLink = account.trackingLinkUrl && account.trackingLinkActive ? null : await ensureCreatorTrackingLink(account.id)
    return {
      ...account,
      trackingLinkUrl: trackingLink?.publicUrl || account.trackingLinkUrl,
      trackingLinkSlug: trackingLink?.slug || account.trackingLinkSlug,
      trackingLinkActive: trackingLink?.isActive ?? account.trackingLinkActive,
      attribution: attributionReportValues(attributionByAccountId.get(account.id)),
    }
  }))
  const attributionByCreatorId = new Map<string, ReturnType<typeof emptyAttributionReport>>()
  const accountCountByCreatorId = new Map<string, number>()
  for (const account of accounts) {
    accountCountByCreatorId.set(account.creatorProfileId, (accountCountByCreatorId.get(account.creatorProfileId) || 0) + 1)
    const current = attributionByCreatorId.get(account.creatorProfileId) || emptyAttributionReport()
    attributionByCreatorId.set(account.creatorProfileId, addAttributionReports(current, account.attribution))
  }
  const creators = creatorRows.map((creator) => ({
    ...creator,
    accountCount: accountCountByCreatorId.get(creator.id) || 0,
    attribution: attributionByCreatorId.get(creator.id) || emptyAttributionReport(),
  }))

  const settings = settingsRecord || {
    id: 'default',
    monthlySubscriptionCents: 999,
    ninetyDayContributionMarginCents: 0,
    updatedAt: new Date(),
  }

  return {
    creators,
    accounts,
    submissions,
    payments,
    attributionMetrics,
    settings,
    rules: {
      compensationCapRate: CREATOR_COMPENSATION_CAP_RATE,
      conversionBonusCapRate: CREATOR_CONVERSION_BONUS_CAP_RATE,
    },
  }
}

function emptyAttributionReport() {
  return {
    clicks: 0,
    uniqueClicks: 0,
    botClicks: 0,
    signups: 0,
    installs: 0,
    paywallViews: 0,
    checkouts: 0,
    purchases: 0,
    paidCustomers: 0,
    refunds: 0,
    disputes: 0,
    grossRevenueCents: 0,
    reversedRevenueCents: 0,
    revenueCents: 0,
    firstTouchSignups: 0,
    firstTouchPaywallViews: 0,
    firstTouchPaidCustomers: 0,
    firstTouchRevenueCents: 0,
    recentClicks: 0,
    recentSignups: 0,
    recentInstalls: 0,
    recentPaywallViews: 0,
    recentPaidCustomers: 0,
    recentRevenueCents: 0,
  }
}

function attributionReportValues(report: Awaited<ReturnType<typeof getCreatorAttributionReport>>[number] | undefined) {
  if (!report) return emptyAttributionReport()
  const values = emptyAttributionReport()
  for (const key of Object.keys(values) as Array<keyof typeof values>) values[key] = report[key]
  return values
}

function addAttributionReports(left: ReturnType<typeof emptyAttributionReport>, right: ReturnType<typeof emptyAttributionReport>) {
  const total = emptyAttributionReport()
  for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] = left[key] + right[key]
  return total
}

export async function saveCreatorAttributionMetrics(input: z.infer<typeof creatorAttributionMetricsSchema>) {
  const submission = await db.query.creatorSubmissions.findFirst({
    where: eq(schema.creatorSubmissions.id, input.submissionId),
  })
  if (!submission) throw new ApiError(404, 'Creator submission not found')

  const values = {
    submissionId: input.submissionId,
    ...(input.postedAt !== undefined ? { postedAt: input.postedAt ? new Date(input.postedAt) : null } : {}),
    qualifiedViews: input.qualifiedViews,
    linkClicks: input.linkClicks,
    installs: input.installs,
    firstTimePaidCustomers: input.firstTimePaidCustomers,
    updatedAt: new Date(),
  }
  const [metrics] = await db.insert(schema.creatorAttributionMetrics).values(values).onConflictDoUpdate({
    target: schema.creatorAttributionMetrics.submissionId,
    set: values,
  }).returning()
  return metrics
}

export async function saveCreatorProgramSettings(input: z.infer<typeof creatorProgramSettingsSchema>) {
  const values = { id: 'default', ...input, updatedAt: new Date() }
  const [settings] = await db.insert(schema.creatorProgramSettings).values(values).onConflictDoUpdate({
    target: schema.creatorProgramSettings.id,
    set: values,
  }).returning()
  return settings
}

export async function reviewCreatorResource(input: CreatorAdminReviewInput, reviewerId?: string) {
  const now = new Date()

  if (input.resource === 'creator') {
    const [record] = await db.update(schema.creatorProfiles).set({ authStatus: input.status, updatedAt: now }).where(eq(schema.creatorProfiles.id, input.id)).returning()
    if (!record) throw new ApiError(404, 'Creator registration not found')
    return record
  }

  if (input.resource === 'account') {
    const [record] = await db.update(schema.creatorSocialAccounts).set({ status: input.status, reviewNote: input.reviewNote || null, updatedAt: now }).where(eq(schema.creatorSocialAccounts.id, input.id)).returning()
    if (!record) throw new ApiError(404, 'Creator account not found')
    return record
  }

  if (input.resource === 'submission') {
    const current = await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, input.id) })
    if (current?.sprintId && current.sprintTerms) return reviewSprintSubmission(input, reviewerId)
    return db.transaction(async tx => {
      const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.id)).for('update')
      if (!submission) throw new ApiError(404, 'Creator submission not found')

      if (!isCreatorViewThreshold(input.adminViewCountThreshold) || (input.adminUsAudiencePercent !== null && !isCreatorTier1AudienceTier(input.adminUsAudiencePercent))) throw new ApiError(400, 'Choose supported historical payout values')
      const reviewChecklist = input.reviewChecklist.map((item) => ({
        id: item.id,
        met: item.met,
        note: item.note || null,
      }))
      if (!validateCreatorSubmissionReviewResults(submission.formatId, reviewChecklist)) {
        throw new ApiError(400, 'Complete every creator-guide review item before saving')
      }
      const [record] = await tx.update(schema.creatorSubmissions).set({
        status: input.status,
        reviewNote: input.reviewNote || null,
        reviewChecklist,
        adminViewCountThreshold: input.adminViewCountThreshold,
        adminUsAudiencePercent: input.adminUsAudiencePercent,
        updatedAt: now,
      }).where(eq(schema.creatorSubmissions.id, input.id)).returning()
      if (!record) throw new ApiError(404, 'Creator submission not found')
      await appendReviewMessage(tx, submission, input.reviewNote, reviewerId)
      return record
    })
  }

  return db.transaction(async tx => {
    const target = await tx.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.id, input.id) })
    if (!target) throw new ApiError(404, 'Creator payment not found')
    const [submission] = target.submissionId ? await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, target.submissionId)).for('update') : []
    const [payment] = await tx.select().from(schema.creatorPayments).where(eq(schema.creatorPayments.id, input.id)).for('update')
    if (!payment) throw new ApiError(404, 'Creator payment not found')
    if (payment.status === 'paid' && (input.status !== 'paid' || (input.amountCents !== undefined && input.amountCents !== payment.amountCents))) throw new ApiError(409, 'Completed payments cannot be changed')
    if (submission?.sprintId && input.amountCents !== undefined && input.amountCents !== payment.amountCents) throw new ApiError(409, 'Sprint payments use the approved earnings amount')
    if (submission?.sprintId && ['pending', 'processing', 'paid'].includes(input.status)) {
      const others = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
      const available = remainingCreatorPaymentCents(submission.approvedAmountCents || 0, others.filter(other => other.id !== payment.id))
      if (payment.amountCents > available) throw new ApiError(409, 'This payment would exceed the approved unpaid earnings')
    }
    const [record] = await tx.update(schema.creatorPayments).set({ status: input.status, ...(input.amountCents === undefined ? {} : { amountCents: input.amountCents }), ...(input.providerReference === undefined ? {} : { providerReference: input.providerReference || null }), paidAt: input.status === 'paid' ? payment.paidAt || now : null, updatedAt: now }).where(eq(schema.creatorPayments.id, input.id)).returning()
    if (submission?.sprintId && submission.status === 'approved' && input.status === 'paid' && payment.status !== 'paid') await tx.update(schema.creatorSubmissions).set({ status: 'paid', updatedAt: now }).where(eq(schema.creatorSubmissions.id, submission.id))
    return record
  })
}

export async function createCreatorPayment(input: CreatorAdminPaymentInput) {
  const submission = await db.query.creatorSubmissions.findFirst({
    where: eq(schema.creatorSubmissions.id, input.submissionId),
  })
  if (!submission) throw new ApiError(404, 'Creator submission not found')
  if (submission.sprintId) return createSprintPayment(input)
  if (!isCreatorViewThreshold(input.adminViewCountThreshold) || (input.adminUsAudiencePercent !== null && !isCreatorTier1AudienceTier(input.adminUsAudiencePercent))) throw new ApiError(400, 'Choose supported historical payout values')

  const profile = await db.query.creatorProfiles.findFirst({
    where: eq(schema.creatorProfiles.id, submission.creatorProfileId),
  })
  if (!profile) throw new ApiError(404, 'Creator profile not found')

  const existing = await db.query.creatorPayments.findFirst({
    where: eq(schema.creatorPayments.submissionId, submission.id),
  })
  if (existing) throw new ApiError(409, 'A payment already exists for this submission')

  const now = new Date()
  const estimate = calculateCreatorPayout(
    input.adminViewCountThreshold,
    true,
    input.adminUsAudiencePercent
  )
  return db.transaction(async (tx) => {
    await tx.update(schema.creatorSubmissions).set({
      adminViewCountThreshold: input.adminViewCountThreshold,
      adminUsAudiencePercent: input.adminUsAudiencePercent,
      updatedAt: now,
    }).where(eq(schema.creatorSubmissions.id, submission.id))
    const [payment] = await tx.insert(schema.creatorPayments).values({
      creatorProfileId: profile.id,
      submissionId: submission.id,
      amountCents: estimate.payout * 100,
      status: input.status,
      paymentOption: profile.paymentOption,
      providerReference: input.providerReference || null,
      paidAt: input.status === 'paid' ? now : null,
    }).returning()
    return payment
  })
}

async function reviewSprintSubmission(input: Extract<CreatorAdminReviewInput, { resource: 'submission' }>, reviewerId?: string) {
  return db.transaction(async tx => {
    const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.id)).for('update')
    if (!submission?.sprintId || !submission.sprintTerms) throw new ApiError(404, 'Sprint submission not found')
    const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
    if (payments.some(payment => ['pending', 'processing'].includes(payment.status))) throw new ApiError(409, 'Wait for the scheduled payment before reviewing new earnings')
    if (submission.status === 'paid' && !submission.reviewRequestedAt) throw new ApiError(409, 'The creator must submit fresh analytics before rereview')
    if (input.status === 'approved' && !submission.analyticsScreenshotUrl) throw new ApiError(409, 'Fresh analytics evidence is required before approval')
    if (input.status === 'paid') throw new ApiError(400, 'Mark the payment sent to complete a cashout')
    const expected = sprintReviewItems(submission.sprintTerms, submission.formatId || '')
    const ids = new Set(input.reviewChecklist.map(item => item.id))
    if (!expected.length || ids.size !== expected.length || input.reviewChecklist.length !== expected.length || expected.some(item => !ids.has(item.id))) throw new ApiError(400, 'Complete the sprint review checklist')
    const calculated = sprintPayoutCents(submission.sprintTerms, input.adminViewCountThreshold, input.adminUsAudiencePercent)
    const preservedCents = submission.reviewRequestedAt || payments.some(payment => payment.status === 'paid') ? submission.approvedAmountCents || 0 : 0
    const amountCents = input.status === 'approved' ? Math.max(preservedCents, calculated) : preservedCents || null

    if (input.status === 'approved' && (!calculated || input.reviewChecklist.some(item => !item.met))) throw new ApiError(409, 'Approval requires eligible views, audience and every sprint requirement')
    const [sprint] = await tx.select().from(schema.creatorSprints).where(eq(schema.creatorSprints.id, submission.sprintId)).for('update')
    if (!sprint) throw new ApiError(404, 'Sprint not found')
    const [used] = await tx.select({ cents: sql<number>`coalesce(sum(${schema.creatorSubmissions.approvedAmountCents}),0)::float8` }).from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.sprintId, sprint.id))
    const previous = submission.approvedAmountCents || 0
    if (used.cents - previous + (amountCents || 0) > sprint.budgetCents) throw new ApiError(409, 'This approval would exceed the sprint budget')
    const [record] = await tx.update(schema.creatorSubmissions).set({ status: input.status, reviewRequestedAt: ['approved', 'rejected'].includes(input.status) ? null : submission.reviewRequestedAt, approvedAmountCents: amountCents, adminViewCountThreshold: input.adminViewCountThreshold, adminUsAudiencePercent: input.adminUsAudiencePercent, reviewChecklist: input.reviewChecklist.map(item => ({ ...item, note: item.note || null })), reviewNote: input.reviewNote || null, updatedAt: new Date() }).where(eq(schema.creatorSubmissions.id, submission.id)).returning()
    await appendReviewMessage(tx, submission, input.reviewNote, reviewerId)
    return record
  })
}
async function createSprintPayment(input: CreatorAdminPaymentInput) {
  return db.transaction(async tx => {
    const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.submissionId)).for('update')
    if (!submission || submission.status !== 'approved' || !submission.approvedAmountCents) throw new ApiError(409, 'Approve eligible earnings before scheduling a payment')
    const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
    if (payments.some(payment => ['pending', 'processing'].includes(payment.status))) throw new ApiError(409, 'A payment is already scheduled for this submission')
    const amountCents = remainingCreatorPaymentCents(submission.approvedAmountCents, payments)
    if (!amountCents) throw new ApiError(409, 'All approved earnings have already been paid')
    const profile = await tx.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, submission.creatorProfileId) })
    if (!profile || profile.authStatus !== 'verified' || !(profile.paymentOption === 'paypal' ? profile.paypalEmail : profile.cryptoNetwork && profile.cryptoWalletAddress)) throw new ApiError(409, 'An approved payout method is required')
    if (input.adminViewCountThreshold !== submission.adminViewCountThreshold || input.adminUsAudiencePercent !== submission.adminUsAudiencePercent) throw new ApiError(409, 'Use the approved earnings values')
    const [payment] = await tx.insert(schema.creatorPayments).values({ creatorProfileId: profile.id, submissionId: submission.id, amountCents, paymentOption: profile.paymentOption, status: input.status, providerReference: input.providerReference || null, paidAt: input.status === 'paid' ? new Date() : null }).returning()
    if (input.status === 'paid') await tx.update(schema.creatorSubmissions).set({ status: 'paid', updatedAt: new Date() }).where(eq(schema.creatorSubmissions.id, submission.id))
    return payment
  })
}

async function appendReviewMessage(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], submission: { id: string; reviewNote: string | null }, note: string | null | undefined, reviewerId?: string) {
  const body = note?.trim()
  if (body && body !== submission.reviewNote?.trim()) {
    await tx.insert(schema.creatorSubmissionMessages).values({ submissionId: submission.id, authorRole: 'team', authorUserId: reviewerId || null, body })
  }
}
