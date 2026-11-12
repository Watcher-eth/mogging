import { ANALYTICS_VIDEO_REQUEST_MAX_LENGTH } from '@/lib/creator/analytics-video-request'
import { audienceReviewError, verifiedRecordingViews, type AudienceCheck } from '@/lib/creator/audience-check'
import { GENERATED_FACIAL_CAMPAIGN_ID } from '@/lib/creator/facial-campaign-update'
import { lockCampaignBudget } from '@/lib/creator/campaign-budget-service'
import { assertCreatorReferralPaymentsEligible, refreshCreatorReferralBonuses } from '@/lib/creator/creator-referrals'
import { campaignCommittedCents, campaignPendingCents } from '@/lib/creator/campaign-accounting'
import { refreshCreatorBonuses } from '@/lib/creator/bonus-service'
import { hasLaunchCampaignBonuses } from '@/lib/creator/campaign-launch'
import { recordReviewUpdate } from '@/lib/creator/submission-updates'
import { submissionReviewError, AUDIENCE_MINIMUM_REJECTION } from '@/lib/creator/submission-review'
import { rethrowCreatorPostConflict } from '@/lib/creator/post-identity'
import { normalizePaymentReceipt, paymentReceiptSchema } from './payment-receipt'
import { creatorContentPayout } from '@/lib/creator/content-payout'
import { canReceiveCreatorPayout, creatorContentBalances, remainingCreatorPaymentCents } from '@/lib/creator/money'
import { submissionUnreadCount } from '@/lib/creator/submission-messages'
import { sprintPayoutCents, sprintReviewItems } from '@/lib/creator/sprints'
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { AdminQueueData } from '@/components/admin/creator-types'
import { ApiError } from '@/lib/api/http'
import { db, schema } from '@/lib/db'
import { getCreatorCoverage } from './creator-coverage'
import { listCreatorInternalWarnings } from './creator-warnings'
import { getCreatorAttributionReport } from '@/lib/creator/attribution'
import {
  creatorSubmissionReviewResultsSchema,
  validateCreatorSubmissionReviewResults,
  getCreatorSubmissionReviewItems,
} from '@/lib/creator/submission-review'
import {
  calculateCreatorPayout,
  isCreatorTier1AudienceTier,
  isCreatorViewThreshold,
} from '@/lib/creator/payouts'

export const creatorAdminReviewSchema = z.discriminatedUnion('resource', [
  z.object({
    resource: z.literal('analytics_video_request'),
    id: z.string().min(1),
    evidenceKey: z.string().min(1).max(500).nullable(),
    description: z.string().trim().min(1).max(ANALYTICS_VIDEO_REQUEST_MAX_LENGTH),
  }),
  z.object({ resource: z.literal('exclusivity'), id: z.string().min(1), confirmed: z.boolean() }),
  z.object({
    resource: z.literal('creator'),
    id: z.string().min(1),
    status: z.enum(['pending', 'verified', 'suspended']),
    videoStudioAccess: z.boolean().optional(),
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
    approvedAmountCents: z.number().int().nonnegative().max(2_000_000_000).optional().nullable(),
    approveWithoutPayment: z.boolean().optional(),
    adminViewCountThreshold: z.number().int().nonnegative().max(2_000_000_000),
    adminUsAudiencePercent: z.number().min(0).max(100).nullable(),
    audienceEvidenceKey: z.string().min(1).max(500).optional().nullable(),
    manualAudienceConfirmed: z.boolean().optional(),
  }),
  z.object({
    resource: z.literal('payment'),
    id: z.string().min(1),
    status: z.enum(['pending', 'processing', 'paid', 'failed', 'cancelled']),
    amountCents: z.number().int().nonnegative().optional(),
    expectedAmountCents: z.number().int().positive().optional(),
    providerReference: z.string().trim().max(180).optional().nullable(),
    receiptImage: paymentReceiptSchema,
  }),
])

export const creatorAdminPaymentSchema = z.object({
  submissionId: z.string().min(1),
  expectedAmountCents: z.number().int().positive().optional(),
  adminViewCountThreshold: z.number().int().nonnegative().max(2_000_000_000),
  adminUsAudiencePercent: z.number().min(0).max(100).nullable(),
  status: z.enum(['pending', 'processing', 'paid', 'failed', 'cancelled']).default('pending'),
  providerReference: z.string().trim().max(180).optional().nullable(),
    receiptImage: paymentReceiptSchema,
})

export const creatorProgramSettingsSchema = z.object({
  monthlySubscriptionCents: z.number().int().positive().max(1_000_000),
  ninetyDayContributionMarginCents: z.number().int().nonnegative().max(10_000_000),
})

export const CREATOR_COMPENSATION_CAP_RATE = 0.35
export const CREATOR_CONVERSION_BONUS_CAP_RATE = 0.25

export type CreatorAdminReviewInput = z.infer<typeof creatorAdminReviewSchema>
export type CreatorAdminPaymentInput = z.infer<typeof creatorAdminPaymentSchema>

const submission = schema.creatorSubmissions
const check = submission.audienceCheck
const manualCounts = submission.manualReachViewCounts
const reachViewCounts = sql<import('./reach-views').ReachViewCounts | null>`case
  when ${manualCounts} is not null and (${manualCounts}->>'storageKey') is not distinct from ${submission.analyticsStorageKey}
    then jsonb_build_object('reach', ${manualCounts}->'reach', 'views', ${manualCounts}->'views', 'source', 'manual')
  when ${check}->>'storageKey' = ${submission.analyticsStorageKey} and ${check}->>'status' in ('verified', 'needs_review')
    then jsonb_build_object(
      'reach', ${check}#>'{metrics,totalViewers}',
      'views', ${check}#>'{metrics,totalViews}',
      'unverified', not coalesce(${check}#>'{metricsVerified,totalViewers}' = 'true'::jsonb
        and ${check}#>'{metricsVerified,totalViews}' = 'true'::jsonb, false),
      'approximate', not coalesce(${check}#>'{metricsVerified,totalViewsExact}' = 'true'::jsonb
        and ${check}#>'{metrics,totalViewsExact}' = 'true'::jsonb, false),
      'source', 'ocr'
    )
  end`

function getAdminSubmissions(scope?: SQL, reviewId?: string) {
  return db.select({
    id: schema.creatorSubmissions.id,
    reachViewCounts,
    unreadMessages: submissionUnreadCount('team'),
    studioGenerationId: schema.creatorSubmissions.studioGenerationId,
    creatorProfileId: schema.creatorSubmissions.creatorProfileId,
    creatorName: schema.creatorProfiles.displayName,
    creatorEmail: schema.users.email,
    socialAccountId: schema.creatorSubmissions.socialAccountId,
    socialHandle: schema.creatorSocialAccounts.handle,
    creatorAvatarUrl: sql<string | null>`coalesce(nullif(${schema.creatorSocialAccounts.avatarUrl}, ''), ${schema.users.image})`,
    socialAccountStatus: schema.creatorSocialAccounts.status,
    sprintId: schema.creatorSubmissions.sprintId,
    sprintName: schema.creatorSprints.name,
    sprintTerms: reviewId ? sql<(typeof schema.creatorSubmissions.$inferSelect)['sprintTerms'] | null>`case when ${schema.creatorSubmissions.id} = ${reviewId} then ${schema.creatorSubmissions.sprintTerms} end` : schema.creatorSubmissions.sprintTerms,
    approvedAmountCents: schema.creatorSubmissions.approvedAmountCents,
    campaignPayoutCorrected: schema.creatorSubmissions.campaignPayoutCorrected,
    reviewRequestedAt: schema.creatorSubmissions.reviewRequestedAt,
    analyticsVideoRequest: schema.creatorSubmissions.analyticsVideoRequest,
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
    analyticsStorageKey: schema.creatorSubmissions.analyticsStorageKey,
    audienceCheck: reviewId ? sql<(typeof schema.creatorSubmissions.$inferSelect)['audienceCheck'] | null>`case when ${schema.creatorSubmissions.id} = ${reviewId} then ${schema.creatorSubmissions.audienceCheck} end` : schema.creatorSubmissions.audienceCheck,
    analyticsContentType: schema.creatorSubmissions.analyticsContentType,
    analyticsSizeBytes: schema.creatorSubmissions.analyticsSizeBytes,
    viewCountThreshold: schema.creatorSubmissions.viewCountThreshold,
    usAudiencePercent: schema.creatorSubmissions.usAudiencePercent,
    adminViewCountThreshold: schema.creatorSubmissions.adminViewCountThreshold,
    adminUsAudiencePercent: schema.creatorSubmissions.adminUsAudiencePercent,
    status: schema.creatorSubmissions.status,
    exclusivityConfirmed: schema.creatorSubmissions.exclusivityConfirmed,
    reviewNote: schema.creatorSubmissions.reviewNote,
    reviewChecklist: reviewId ? sql<(typeof schema.creatorSubmissions.$inferSelect)['reviewChecklist'] | null>`case when ${schema.creatorSubmissions.id} = ${reviewId} then ${schema.creatorSubmissions.reviewChecklist} end` : schema.creatorSubmissions.reviewChecklist,
    createdAt: schema.creatorSubmissions.createdAt,
    updatedAt: schema.creatorSubmissions.updatedAt,
  })
    .from(schema.creatorSubmissions)
    .leftJoin(schema.creatorSprints, eq(schema.creatorSubmissions.sprintId, schema.creatorSprints.id))
    .innerJoin(schema.creatorProfiles, eq(schema.creatorSubmissions.creatorProfileId, schema.creatorProfiles.id))
    .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
    .leftJoin(schema.creatorSocialAccounts, eq(schema.creatorSubmissions.socialAccountId, schema.creatorSocialAccounts.id))
    .where(and(eq(schema.creatorSubmissions.isDraft, false), scope))
    .orderBy(desc(schema.creatorSubmissions.createdAt))
}

function getAdminPayments(scope?: SQL) {
  return db
    .select({
      id: schema.creatorPayments.id,
      creatorProfileId: schema.creatorPayments.creatorProfileId,
      creatorName: schema.creatorProfiles.displayName,
      creatorEmail: schema.users.email,
      submissionId: schema.creatorPayments.submissionId,
      submissionTitle: sql<string | null>`coalesce(${schema.creatorPayments.bonusNote}, ${schema.creatorSubmissions.title})`,
      bonusSprintId: schema.creatorPayments.bonusSprintId,
      bonusKey: schema.creatorPayments.bonusKey,
      bonusNote: schema.creatorPayments.bonusNote,
      amountCents: schema.creatorPayments.amountCents,
      payoutRequestId: schema.creatorPayments.payoutRequestId,
      cryptoChain: schema.creatorCryptoPayoutBatches.chain,
      currency: schema.creatorPayments.currency,
      status: schema.creatorPayments.status,
      paymentOption: schema.creatorPayments.paymentOption,
      providerReference: schema.creatorPayments.providerReference,
      hasReceipt: sql<boolean>`${schema.creatorPaymentReceipts.paymentId} is not null`,
      paidAt: schema.creatorPayments.paidAt,
      createdAt: schema.creatorPayments.createdAt,
    })
    .from(schema.creatorPayments)
    .innerJoin(schema.creatorProfiles, eq(schema.creatorPayments.creatorProfileId, schema.creatorProfiles.id))
    .leftJoin(schema.creatorPaymentReceipts, eq(schema.creatorPaymentReceipts.paymentId, schema.creatorPayments.id))
    .leftJoin(schema.creatorCryptoPayoutBatches, eq(schema.creatorCryptoPayoutBatches.id, schema.creatorPayments.cryptoBatchId))
    .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
    .leftJoin(schema.creatorSubmissions, eq(schema.creatorPayments.submissionId, schema.creatorSubmissions.id))
    .where(scope)
    .orderBy(desc(schema.creatorPayments.createdAt))
}

export async function getCreatorAdminDashboard({ includeCoverage = true, creatorId, reviewId }: { includeCoverage?: boolean; creatorId?: string; reviewId?: string } = {}) {
  const [creatorRows, accountRows, submissions, payments, attributionMetrics, settingsRecord, accountAttributionRows, payoutRequests, creatorCoverage, warningRows] = await Promise.all([
    db
      .select({
        id: schema.creatorProfiles.id,
        userId: schema.creatorProfiles.userId,
        displayName: schema.creatorProfiles.displayName,
        bundledPayouts: schema.creatorProfiles.bundledPayouts,
        videoStudioAccess: schema.creatorProfiles.videoStudioAccess,
        retainerTerms: schema.creatorProfiles.retainerTerms,
        email: schema.users.email,
        image: schema.users.image,
        primaryContact: schema.creatorProfiles.socialHandle,
        authStatus: schema.creatorProfiles.authStatus,
        paymentOption: schema.creatorProfiles.paymentOption,
        paypalEmail: schema.creatorProfiles.paypalEmail,
        paypalMeUrl: schema.creatorProfiles.paypalMeUrl,
        cryptoNetwork: schema.creatorProfiles.cryptoNetwork,
        cryptoWalletAddress: schema.creatorProfiles.cryptoWalletAddress,
        bankTransferDetails: schema.creatorProfiles.bankTransferDetails,
        createdAt: schema.creatorProfiles.createdAt,
        lastActiveAt: sql<string | null>`(select to_char(max(a.occurred_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from analytics_events a
          where a.account_id = ${schema.users.id} and a.environment = 'production' and a.platform = 'web'
          and a.event_name in ('page_viewed', 'page_exited') and a.properties->>'path' ~ '^/creator(/|$)'
          and a.occurred_at <= now())`,
      })
      .from(schema.creatorProfiles)
      .innerJoin(schema.users, eq(schema.creatorProfiles.userId, schema.users.id))
      .where(creatorId ? eq(schema.creatorProfiles.id, creatorId) : undefined)
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
      .where(creatorId ? eq(schema.creatorSocialAccounts.creatorProfileId, creatorId) : undefined)
      .orderBy(desc(schema.creatorSocialAccounts.createdAt)),
    getAdminSubmissions(creatorId ? eq(schema.creatorSubmissions.creatorProfileId, creatorId) : undefined, reviewId),
    getAdminPayments(creatorId ? sql`(${schema.creatorPayments.creatorProfileId} = ${creatorId}
      or (${Boolean(reviewId)} and ${schema.creatorPayments.bonusSprintId} = (
        select s.sprint_id from creator_submissions s where s.id = ${reviewId ?? ''}
      )))` : undefined),
    db.query.creatorAttributionMetrics.findMany({ where: creatorId ? sql`exists (select 1 from creator_submissions s where s.id = ${schema.creatorAttributionMetrics.submissionId} and s.creator_profile_id = ${creatorId})` : undefined }),
    db.query.creatorProgramSettings.findFirst({
      where: eq(schema.creatorProgramSettings.id, 'default'),
    }),
    creatorId ? [] : getCreatorAttributionReport(),
    db.query.creatorPayoutRequests.findMany({ where: and(eq(schema.creatorPayoutRequests.status, 'pending'), creatorId ? eq(schema.creatorPayoutRequests.creatorProfileId, creatorId) : undefined), orderBy: [desc(schema.creatorPayoutRequests.requestedAt)] }),
    includeCoverage && !creatorId ? getCreatorCoverage() : undefined,
    listCreatorInternalWarnings(creatorId),
  ])

  const attributionByAccountId = new Map(accountAttributionRows.map((report) => [report.socialAccountId, report]))
  const lastActiveByCreator = new Map(creatorRows.map(creator => [creator.id, creator.lastActiveAt]))
  const accounts = accountRows.map((account) => ({
    ...account,
    lastActiveAt: lastActiveByCreator.get(account.creatorProfileId) ?? null,
    attribution: attributionReportValues(attributionByAccountId.get(account.id)),
  }))
  const attributionByCreatorId = new Map<string, ReturnType<typeof emptyAttributionReport>>()
  const accountCountByCreatorId = new Map<string, number>()
  const warningsByCreatorId = new Map<string, typeof warningRows>()
  for (const warning of warningRows) {
    const warnings = warningsByCreatorId.get(warning.creatorProfileId) || []
    warnings.push(warning)
    warningsByCreatorId.set(warning.creatorProfileId, warnings)
  }
  for (const account of accounts) {
    accountCountByCreatorId.set(account.creatorProfileId, (accountCountByCreatorId.get(account.creatorProfileId) || 0) + 1)
    const current = attributionByCreatorId.get(account.creatorProfileId) || emptyAttributionReport()
    attributionByCreatorId.set(account.creatorProfileId, addAttributionReports(current, account.attribution))
  }
  const creators = creatorRows.map((creator) => ({
    ...creator,
    accountCount: accountCountByCreatorId.get(creator.id) || 0,
    warnings: warningsByCreatorId.get(creator.id) || [],
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
    payoutRequests,
    attributionMetrics,
    creatorCoverage,
    settings,
    rules: {
      compensationCapRate: CREATOR_COMPENSATION_CAP_RATE,
      conversionBonusCapRate: CREATOR_CONVERSION_BONUS_CAP_RATE,
    },
  }
}

const payment = schema.creatorPayments
const request = schema.creatorPayoutRequests
const warning = schema.creatorInternalWarnings
const submitOnPublish = sql<boolean>`coalesce(${submission.sprintTerms}->'submitOnPublish' = 'true'::jsonb, false)`

const queueSubmissionFields = {
  reachViewCounts,
  id: submission.id,
  studioGenerationId: submission.studioGenerationId,
  awaitingAnalyticsVideo: sql<boolean>`${submission.analyticsVideoRequest} is not null`,
  hasAnalyticsRecording: sql<boolean>`nullif(${submission.analyticsScreenshotUrl}, '') is not null`,
  submitOnPublish,
  viewCountThreshold: submission.viewCountThreshold,
  creatorProfileId: submission.creatorProfileId,
  creatorName: schema.creatorProfiles.displayName,
  socialHandle: schema.creatorSocialAccounts.handle,
  sprintId: submission.sprintId,
  sprintName: schema.creatorSprints.name,
  formatId: submission.formatId,
  formatName: sql<string | null>`(select format->>'name'
    from jsonb_array_elements(case when jsonb_typeof(${submission.sprintTerms}->'formats') = 'array'
      then ${submission.sprintTerms}->'formats' else '[]'::jsonb end) format
    where format->>'id' = ${submission.formatId} limit 1)`,
  retainerTerms: sql<NonNullable<(typeof submission.$inferSelect)['sprintTerms']>['retainer'] | null>`${submission.sprintTerms}->'retainer'`,
  title: submission.title,
  platform: submission.platform,
  status: submission.status,
  approvedAmountCents: submission.approvedAmountCents,
  adminViewCountThreshold: submission.adminViewCountThreshold,
  adminUsAudiencePercent: submission.adminUsAudiencePercent,
  createdAt: submission.createdAt,
  reviewRequestedAt: submission.reviewRequestedAt,
}

function getQueueSubmissionRows(scope: SQL | undefined, includeWarningHistory = false) {
  return db.select({
    ...queueSubmissionFields,
    ...(includeWarningHistory ? {
      hasWrongCampaignWarning: sql<boolean>`exists (select 1 from ${warning}
        where ${warning.creatorProfileId} = ${submission.creatorProfileId}
          and ${warning.category} = ${'wrong_campaign'})`,
    } : {}),
    cursorTime: sql<string>`to_char(${submission.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  })
    .from(submission)
    .leftJoin(schema.creatorSprints, eq(submission.sprintId, schema.creatorSprints.id))
    .innerJoin(schema.creatorProfiles, eq(submission.creatorProfileId, schema.creatorProfiles.id))
    .leftJoin(schema.creatorSocialAccounts, eq(submission.socialAccountId, schema.creatorSocialAccounts.id))
    .where(and(eq(submission.isDraft, false), scope))
}

const requestedPayment = sql`exists (select 1 from creator_payout_requests pr
  where pr.id = ${payment.payoutRequestId} and pr.status = 'pending')`
const requestedSubmission = sql`exists (select 1 from creator_payments p join creator_payout_requests pr
  on p.payout_request_id = pr.id and pr.status = 'pending'
  where p.submission_id = ${submission.id} and p.status <> 'cancelled')`
const queuedSubmission = sql`${submission.status} in ('pending', 'in_review')
  and (${submission.studioGenerationId} is null or nullif(${submission.analyticsScreenshotUrl}, '') is not null
    or (${submission.sprintId} = ${GENERATED_FACIAL_CAMPAIGN_ID} and ${submitOnPublish}))`

export async function getCreatorReviewQueue(now = new Date()) {
  const dayAgo = new Date(now.getTime() - 86_400_000).toISOString()
  const cutoff = now.toISOString()
  const recent = (column: SQL) => sql`${column} > ${dayAgo}::timestamp and ${column} <= ${cutoff}::timestamp`
  const [counts, submissions, payouts, payments, creators] = await Promise.all([
    db.execute<AdminQueueData['counts']>(sql`select
      (select count(*)::int from creator_submissions where not is_draft) as "videoCount",
      (select count(*)::int from creator_submissions where not is_draft and status = 'pending' and analytics_video_request is null) as "pendingCount",
      (select count(*)::int from creator_submissions where not is_draft and ${recent(sql`created_at`)}) as "newVideos",
      (select count(*)::int from creator_social_accounts) as "accountCount",
      (select count(*)::int from creator_social_accounts where ${recent(sql`created_at`)}) as "newAccounts",
      count(*)::int as "paymentCount",
      coalesce(sum(amount_cents), 0)::float8 as "outstandingCents",
      coalesce(sum(amount_cents) filter (where ${recent(sql`created_at`)}), 0)::float8 as "newOutstandingCents"
      from creator_payments where status in ('pending', 'processing')`),
    getQueueSubmissionRows(sql`(${queuedSubmission}) or ${submission.analyticsVideoRequest} is not null or ${requestedSubmission}`, true).orderBy(desc(submission.createdAt), desc(submission.id)),
    db.query.creatorPayoutRequests.findMany({ where: eq(request.status, 'pending'), orderBy: [desc(request.requestedAt)] }),
    db.select({
      submissionId: payment.submissionId, payoutRequestId: payment.payoutRequestId, amountCents: payment.amountCents,
      status: payment.status, cryptoChain: schema.creatorCryptoPayoutBatches.chain,
    }).from(payment).leftJoin(schema.creatorCryptoPayoutBatches, eq(schema.creatorCryptoPayoutBatches.id, payment.cryptoBatchId))
      .where(sql`${requestedPayment} or (${payment.status} in ('paid', 'processing') and exists (
        select 1 from creator_payments p join creator_payout_requests pr on pr.id = p.payout_request_id
        where pr.status = 'pending' and p.status <> 'cancelled' and p.submission_id = ${payment.submissionId}
      ))`),
    db.select({ id: schema.creatorProfiles.id, displayName: schema.creatorProfiles.displayName })
      .from(schema.creatorProfiles).where(sql`exists (select 1 from creator_payout_requests pr
        where pr.creator_profile_id = ${schema.creatorProfiles.id} and pr.status = 'pending')`),
  ])
  return { counts: counts[0], submissions: submissions.map(({ cursorTime: _, ...row }) => row), payoutRequests: payouts, payments, creators }
}

const pageSize = 30

export const reviewedSubmissionsQuery = z.object({
  search: z.string().trim().max(200).default(''),
  before: z.string().datetime().optional(),
  beforeId: z.string().min(1).max(120).optional(),
}).refine(query => Boolean(query.before) === Boolean(query.beforeId))

export async function getReviewedCreatorSubmissions({ search, before, beforeId }: z.infer<typeof reviewedSubmissionsQuery>) {
  const rows = await getQueueSubmissionRows(and(
    inArray(submission.status, ['approved', 'paid']),
    search ? sql`strpos(lower(concat_ws(' ', ${schema.creatorProfiles.displayName}, ${schema.creatorSocialAccounts.handle},
      ${submission.title}, ${schema.creatorSprints.name})), lower(${search})) > 0` : undefined,
    before ? sql`(${submission.createdAt}, ${submission.id}) < (${before}::timestamp, ${beforeId})` : undefined,
  )).orderBy(desc(submission.createdAt), desc(submission.id)).limit(pageSize + 1)
  const page = rows.slice(0, pageSize)
  const last = page.at(-1)
  return {
    submissions: page.map(({ cursorTime: _, ...row }) => row),
    next: last && rows.length > pageSize ? { before: last.cursorTime, beforeId: last.id } : null,
  }
}

export async function getCreatorSubmissionReview(reviewId: string) {
  const [owner] = await db.select({ creatorId: submission.creatorProfileId }).from(submission)
    .where(and(eq(submission.id, reviewId), eq(submission.isDraft, false)))
  if (!owner) throw new ApiError(404, 'Submission not found')
  const data = await getCreatorAdminDashboard({ creatorId: owner.creatorId, reviewId })
  const target = data.submissions.find(item => item.id === reviewId)
  if (!target) throw new ApiError(404, 'Submission not found')
  const balances = creatorContentBalances(data.submissions, data.payments.filter(row => row.creatorProfileId === owner.creatorId))
  return {
    target, creator: data.creators[0],
    payments: data.payments.filter(row => row.submissionId === reviewId || row.bonusSprintId != null),
    metrics: data.attributionMetrics.filter(row => row.submissionId === reviewId),
    balance: { ...balances, unpaid: [...balances.unpaid] },
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

export async function saveCreatorProgramSettings(input: z.infer<typeof creatorProgramSettingsSchema>) {
  const values = { id: 'default', ...input, updatedAt: new Date() }
  const [settings] = await db.insert(schema.creatorProgramSettings).values(values).onConflictDoUpdate({
    target: schema.creatorProgramSettings.id,
    set: values,
  }).returning()
  return settings
}

function requireCurrentReviewEvidence(
  submission: Pick<typeof schema.creatorSubmissions.$inferSelect, 'analyticsVideoRequest' | 'analyticsStorageKey'>,
  evidenceKey: string | null | undefined,
) {
  if (submission.analyticsVideoRequest) throw new ApiError(409, 'Wait for the creator to submit a new analytics video before saving the review')
  if (evidenceKey !== undefined && submission.analyticsStorageKey !== evidenceKey) throw new ApiError(409, 'The analytics recording changed. Reopen this review to see the latest recording.')
}

export async function reviewCreatorResource(input: CreatorAdminReviewInput, reviewerId?: string) {
  if (input.resource === 'analytics_video_request') {
    return db.transaction(async tx => {
      const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.id)).for('update')
      if (!submission || submission.isDraft) throw new ApiError(404, 'Creator submission not found')
      if (submission.analyticsVideoRequest) throw new ApiError(409, 'A new analytics video has already been requested')
      if (!submission.analyticsScreenshotUrl || !submission.analyticsContentType?.startsWith('video/')) throw new ApiError(409, 'This submission does not have an analytics video to replace')
      requireCurrentReviewEvidence(submission, input.evidenceKey)
      const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id), columns: { status: true } })
      if (payments.some(payment => ['pending', 'processing'].includes(payment.status))) throw new ApiError(409, 'Wait for the scheduled payment before requesting a new analytics video')
      const analyticsVideoRequest = { id: crypto.randomUUID(), description: input.description }
      const [record] = await tx.update(schema.creatorSubmissions).set({ analyticsVideoRequest, updatedAt: new Date() })
        .where(eq(schema.creatorSubmissions.id, input.id)).returning()
      await tx.insert(schema.creatorSubmissionMessages).values({
        submissionId: input.id, authorRole: 'team', authorUserId: reviewerId || null,
        body: `New analytics video requested:\n${input.description}`,
      })
      return record
    })
  }

  const now = new Date()

  if (input.resource === 'exclusivity') {
    const record = await db.transaction(async tx => {
      const found = await tx.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, input.id) })
      if (!found || found.isDraft) throw new ApiError(404, 'Submitted post not found')
      if (!hasLaunchCampaignBonuses(found)) throw new ApiError(400, 'Bio-link bonus review is only available for new campaign submissions')
      await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, found.creatorProfileId)).for('update')
      if (!input.confirmed) {
        const [awarded] = await tx.select({ id: schema.creatorPayments.id }).from(schema.creatorPayments).where(and(
          eq(schema.creatorPayments.creatorProfileId, found.creatorProfileId),
          sql`${schema.creatorPayments.bonusKey} like 'exclusivity:%' and ${schema.creatorPayments.status} <> 'cancelled' and exists (
            select 1 from creator_sprints c where c.id = ${schema.creatorPayments.bonusSprintId}
            and ${found.createdAt.toISOString()}::timestamp >= c.starts_at and ${found.createdAt.toISOString()}::timestamp < c.ends_at
          )`,
        )).limit(1)
        if (awarded) throw new ApiError(409, 'This period has approved bio-link bonus awards. Resolve those payments before changing its verification.')
      }
      const [saved] = await tx.update(schema.creatorSubmissions).set({ exclusivityConfirmed: input.confirmed }).where(eq(schema.creatorSubmissions.id, input.id)).returning()
      return saved
    })
    await refreshCreatorBonuses(record.creatorProfileId)
    return record
  }

  if (input.resource === 'creator') {
    const [record] = await db.update(schema.creatorProfiles).set({ authStatus: input.status, ...(input.videoStudioAccess === undefined ? {} : { videoStudioAccess: input.videoStudioAccess }), updatedAt: now }).where(eq(schema.creatorProfiles.id, input.id)).returning()
    if (!record) throw new ApiError(404, 'Creator registration not found')
    return record
  }

  if (input.resource === 'account') {
    const [record] = await db.update(schema.creatorSocialAccounts).set({ status: input.status, reviewNote: input.reviewNote || null, updatedAt: now }).where(eq(schema.creatorSocialAccounts.id, input.id)).returning()
    if (!record) throw new ApiError(404, 'Creator account not found')
    return record
  }

  if (input.resource === 'submission') {
    if (input.approvedAmountCents != null && input.status !== 'approved') throw new ApiError(400, 'Approve the submission before adjusting its payout')
    const reviewError = submissionReviewError(input.status, input.reviewChecklist)
    if (reviewError) throw new ApiError(400, reviewError)
    const current = await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, input.id) })
    if (current?.studioGenerationId && !current.analyticsScreenshotUrl) throw new ApiError(409, 'The creator must request their first review with milestone analytics')
    if (current?.sprintId && current.sprintTerms) return reviewSprintSubmission(input, current.creatorProfileId, reviewerId).then(async record => { if (record.sprintTerms?.bonusBudgetCents) await refreshCreatorBonuses(record.creatorProfileId); return record }).catch(rethrowCreatorPostConflict)
    return db.transaction(async tx => {
      const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.id)).for('update')
      if (submission?.isDraft) throw new ApiError(409, 'This post has not been submitted for review')
      if (!submission) throw new ApiError(404, 'Creator submission not found')
      requireCurrentReviewEvidence(submission, input.audienceEvidenceKey)

      if (!isCreatorViewThreshold(input.adminViewCountThreshold) || (input.adminUsAudiencePercent !== null && !isCreatorTier1AudienceTier(input.adminUsAudiencePercent))) throw new ApiError(400, 'Choose supported historical payout values')
      const reviewChecklist = input.reviewChecklist.map((item) => ({
        id: item.id,
        met: item.met,
        note: item.note || null,
      }))
      if (!validateCreatorSubmissionReviewResults(submission.formatId, reviewChecklist)) {
        throw new ApiError(400, 'Complete every creator-guide review item before saving')
      }
      const publishingPolicyItems = getCreatorSubmissionReviewItems(submission.formatId, submission.createdAt)
      const publishingReviewError = submissionReviewError(input.status, reviewChecklist.map(item => ({ ...item, waived: publishingPolicyItems.find(rule => rule.id === item.id)?.waived })))
      if (publishingReviewError) throw new ApiError(400, publishingReviewError)
      const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
      if (payments.some(payment => payment.cryptoBatchId && payment.status === 'processing')) throw new ApiError(409, 'Wait for on-chain payout confirmation before changing the review')
      const calculated = Math.round(calculateCreatorPayout(input.adminViewCountThreshold, true, input.adminUsAudiencePercent).payout * 100)
      const approvedAmountCents = input.status === 'approved' ? reviewedPayoutCents(input, calculated, payments) : submission.approvedAmountCents
      if (input.status === 'approved' && approvedAmountCents !== (submission.approvedAmountCents ?? calculated) && payments.some(payment => ['pending', 'processing'].includes(payment.status))) throw new ApiError(409, 'Resolve the scheduled payment before adjusting earnings')
      const [record] = await tx.update(schema.creatorSubmissions).set({
        approvedAmountCents: input.status === 'approved' ? approvedAmountCents : submission.approvedAmountCents,
        status: input.status,
        reviewRequestedAt: ['approved', 'rejected', 'paid'].includes(input.status) ? null : submission.reviewRequestedAt,
        reviewNote: input.reviewNote || null,
        reviewChecklist,
        adminViewCountThreshold: input.adminViewCountThreshold,
        adminUsAudiencePercent: input.adminUsAudiencePercent,
        updatedAt: now,
      }).where(eq(schema.creatorSubmissions.id, input.id)).returning()
      if (!record) throw new ApiError(404, 'Creator submission not found')
      await appendReviewMessage(tx, submission, input.reviewNote, reviewerId)
      await recordReviewUpdate(tx, submission, { ...input, approvedAmountCents: record.approvedAmountCents })
      return record
    }).catch(rethrowCreatorPostConflict)
  }

  const receiptImage = await normalizePaymentReceipt(input.receiptImage)
  return db.transaction(async tx => {
    const target = await tx.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.id, input.id) })
    if (!target) throw new ApiError(404, 'Creator payment not found')
    await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, target.creatorProfileId)).for('update')
    const [submission] = target.submissionId ? await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, target.submissionId)).for('update') : []
    const [payment] = await tx.select().from(schema.creatorPayments).where(eq(schema.creatorPayments.id, input.id)).for('update')
    if (!payment) throw new ApiError(404, 'Creator payment not found')
    if (input.expectedAmountCents !== undefined && (payment.amountCents !== input.expectedAmountCents || payment.status === 'cancelled')) throw new ApiError(409, 'The payout changed. Refresh before recording payment.')
    if ((payment.bonusSprintId || payment.creatorReferralAwardId) && input.amountCents !== undefined && input.amountCents !== payment.amountCents) throw new ApiError(409, 'Automatic bonus awards cannot be edited. Cancel an incorrect award instead.')
    if (payment.cryptoBatchId) throw new ApiError(409, 'This payment is managed by on-chain reconciliation')
    if (payment.payoutRequestId) throw new ApiError(409, 'Record this payment through its bundled payout request')
    if (['pending', 'processing', 'paid'].includes(input.status)) {
      if (payment.creatorReferralAwardId && payment.status !== 'paid') await assertCreatorReferralPaymentsEligible(tx, [payment])
      const profile = await tx.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, payment.creatorProfileId) })
      if (profile?.bundledPayouts && !['processing', 'paid'].includes(payment.status)) throw new ApiError(409, 'This creator uses bundled payouts. Wait for their payout request.')
    }
    if (payment.status === 'paid' && (input.status !== 'paid' || (input.amountCents !== undefined && input.amountCents !== payment.amountCents))) throw new ApiError(409, 'Completed payments cannot be changed')
    if (submission?.sprintId && input.amountCents !== undefined && input.amountCents !== payment.amountCents) throw new ApiError(409, 'Sprint payments use the approved earnings amount')
    if (submission && payment.status !== 'paid' && ['pending', 'processing', 'paid'].includes(input.status)) {
      const { unpaid, payments, overpaymentCents } = await creatorContentPayout(tx, submission.creatorProfileId)
      if (submission.sprintId || overpaymentCents > 0) {
        const reserved = payments.filter(other => other.submissionId === submission.id && other.id !== payment.id && ['pending', 'processing'].includes(other.status))
          .reduce((sum, other) => sum + other.amountCents, 0)
        if ((input.amountCents ?? payment.amountCents) > (unpaid.get(submission.id) ?? 0) - reserved) {
          throw new ApiError(409, overpaymentCents ? 'This payment would exceed the corrected unpaid earnings' : 'This payment would exceed the approved unpaid earnings')
        }
      }
    }
    const [record] = await tx.update(schema.creatorPayments).set({ status: input.status, ...(input.amountCents === undefined ? {} : { amountCents: input.amountCents }), ...(input.providerReference === undefined ? {} : { providerReference: input.providerReference || null }), paidAt: input.status === 'paid' ? payment.paidAt || now : null, updatedAt: now }).where(eq(schema.creatorPayments.id, input.id)).returning()
    if (receiptImage) {
      if (payment.paymentOption !== 'paypal') throw new ApiError(400, 'Image receipts are for PayPal payments')
      await tx.insert(schema.creatorPaymentReceipts).values({ paymentId: record.id, image: receiptImage }).onConflictDoUpdate({ target: schema.creatorPaymentReceipts.paymentId, set: { image: receiptImage } })
    }
    if (submission?.sprintId && submission.status === 'approved' && input.status === 'paid' && payment.status !== 'paid') {
      const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
      if (remainingCreatorPaymentCents(submission.approvedAmountCents || 0, payments, false) === 0) await tx.update(schema.creatorSubmissions).set({ status: 'paid', updatedAt: now }).where(eq(schema.creatorSubmissions.id, submission.id))
    }
    return record
  }).then(async record => {
    if (record.status === 'paid') await refreshCreatorReferralBonuses(record.creatorProfileId)
    if (record.submissionId && record.status === 'paid') {
      const post = await db.query.creatorSubmissions.findFirst({ where: eq(schema.creatorSubmissions.id, record.submissionId) })
      if (post?.sprintTerms?.bonusBudgetCents) await refreshCreatorBonuses(record.creatorProfileId)
    }
    return record
  })
}

export async function createCreatorPayment(input: CreatorAdminPaymentInput) {
  const receiptImage = await normalizePaymentReceipt(input.receiptImage)
  const submission = await db.query.creatorSubmissions.findFirst({
    where: eq(schema.creatorSubmissions.id, input.submissionId),
  })
  if (!submission) throw new ApiError(404, 'Creator submission not found')
  if (submission.sprintId) return createSprintPayment(input, receiptImage, submission.creatorProfileId).then(async payment => { if (payment.status === 'paid') await refreshCreatorReferralBonuses(payment.creatorProfileId); return payment })
  if (!isCreatorViewThreshold(input.adminViewCountThreshold) || (input.adminUsAudiencePercent !== null && !isCreatorTier1AudienceTier(input.adminUsAudiencePercent))) throw new ApiError(400, 'Choose supported historical payout values')

  const now = new Date()
  const estimate = calculateCreatorPayout(
    input.adminViewCountThreshold,
    true,
    input.adminUsAudiencePercent
  )
  return db.transaction(async (tx) => {
    await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, submission.creatorProfileId)).for('update')
    const [lockedSubmission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, submission.id)).for('update')
    if (!lockedSubmission) throw new ApiError(404, 'Creator submission not found')
    if (lockedSubmission.approvedAmountCents != null && (input.adminViewCountThreshold !== lockedSubmission.adminViewCountThreshold || input.adminUsAudiencePercent !== lockedSubmission.adminUsAudiencePercent)) throw new ApiError(409, 'Save the updated payout review before scheduling payment')
    const profile = await tx.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.id, submission.creatorProfileId) })
    if (!profile) throw new ApiError(404, 'Creator profile not found')
    if (!canReceiveCreatorPayout(profile)) throw new ApiError(409, 'Save a complete payout method and ensure creator access is active')
    if (profile.bundledPayouts) throw new ApiError(409, 'This creator uses bundled payouts. Wait for their payout request.')
    const existing = await tx.query.creatorPayments.findFirst({ where: eq(schema.creatorPayments.submissionId, submission.id) })
    if (existing) throw new ApiError(409, 'A payment already exists for this submission')
    await tx.update(schema.creatorSubmissions).set({
      adminViewCountThreshold: input.adminViewCountThreshold,
      adminUsAudiencePercent: input.adminUsAudiencePercent,
      updatedAt: now,
    }).where(eq(schema.creatorSubmissions.id, submission.id))
    const { unpaid, overpaymentCents } = await creatorContentPayout(tx, submission.creatorProfileId)
    const amountCents = overpaymentCents ? unpaid.get(submission.id) ?? 0 : lockedSubmission.approvedAmountCents ?? Math.round(estimate.payout * 100)
    if (input.expectedAmountCents !== undefined && amountCents !== input.expectedAmountCents) throw new ApiError(409, 'The payout changed. Refresh before recording payment.')
    if (amountCents <= 0) throw new ApiError(409, 'No unpaid earnings to schedule')
    const [payment] = await tx.insert(schema.creatorPayments).values({
      creatorProfileId: profile.id,
      submissionId: submission.id,
      amountCents,
      status: input.status,
      paymentOption: profile.paymentOption,
      providerReference: input.providerReference || null,
      paidAt: input.status === 'paid' ? now : null,
    }).returning()
    if (receiptImage) {
      if (profile.paymentOption !== 'paypal') throw new ApiError(400, 'Image receipts are for PayPal payments')
      await tx.insert(schema.creatorPaymentReceipts).values({ paymentId: payment.id, image: receiptImage })
    }
    if (input.status === 'paid' && amountCents >= (lockedSubmission.approvedAmountCents ?? Math.round(estimate.payout * 100))) await tx.update(schema.creatorSubmissions).set({ status: 'paid', updatedAt: now }).where(eq(schema.creatorSubmissions.id, submission.id))
    return payment
  }).then(async payment => { if (payment.status === 'paid') await refreshCreatorReferralBonuses(payment.creatorProfileId); return payment })
}

function reviewedPayoutCents(input: Extract<CreatorAdminReviewInput, { resource: 'submission' }>, calculated: number, payments: { status: string; amountCents: number }[], correctedFloor?: number) {
  const amount = input.approvedAmountCents ?? calculated
  const paid = correctedFloor ?? payments.filter(payment => payment.status === 'paid').reduce((sum, payment) => sum + payment.amountCents, 0)
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 2_000_000_000) throw new ApiError(400, 'Enter a valid payout amount in cents')
  if (amount < paid) throw new ApiError(409, correctedFloor === undefined ? 'The approved total cannot be lower than payments already sent' : 'The approved total cannot be lower than the corrected approval')
  if (input.approvedAmountCents != null && amount !== calculated && !input.reviewNote?.trim()) throw new ApiError(400, 'Explain the payout adjustment so the creator knows why it changed')
  if (!calculated && amount > 0) throw new ApiError(400, 'Eligible views and audience are required before approving earnings')
  return amount
}

async function reviewSprintSubmission(input: Extract<CreatorAdminReviewInput, { resource: 'submission' }>, creatorId: string, reviewerId?: string) {
  return db.transaction(async tx => {
    await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, creatorId)).for('update')
    const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.id)).for('update')
    if (submission?.isDraft) throw new ApiError(409, 'Submit this post for review before approving payment')
    if (!submission?.sprintId || !submission.sprintTerms) throw new ApiError(404, 'Sprint submission not found')
    requireCurrentReviewEvidence(submission, input.audienceEvidenceKey)
    const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
    if (payments.some(payment => ['pending', 'processing'].includes(payment.status))) throw new ApiError(409, 'Wait for the scheduled payment before reviewing new earnings')
    if (submission.status === 'paid' && !submission.reviewRequestedAt) throw new ApiError(409, 'The creator must submit fresh analytics before rereview')
    if (input.status === 'approved' && !submission.analyticsScreenshotUrl) throw new ApiError(409, 'Fresh analytics evidence is required before approval')
    if (input.status === 'paid') throw new ApiError(400, 'Mark the payment sent to complete a cashout')
    if (input.status === 'approved') {
      const error = audienceReviewError(submission.audienceCheck, submission.analyticsStorageKey, input.audienceEvidenceKey,
        input.adminUsAudiencePercent, Boolean(input.manualAudienceConfirmed), submission.sprintTerms)
      if (error) throw new ApiError(409, error)
    }
    const audienceCheck: AudienceCheck | null = input.status === 'approved' && submission.analyticsStorageKey ? {
      ...(submission.audienceCheck ?? { version: 1, storageKey: submission.analyticsStorageKey, status: 'needs_review' }),
      // A manual review closes any pending job; its result must never replace the moderator's decision.
      ...(input.manualAudienceConfirmed && ['queued', 'processing'].includes(submission.audienceCheck?.status ?? 'queued') ? { status: 'needs_review' as const } : {}),
      review: { source: input.manualAudienceConfirmed ? 'manual' : 'automatic', percent: input.adminUsAudiencePercent!,
        views: input.adminViewCountThreshold,
        viewsSource: verifiedRecordingViews(submission.audienceCheck, submission.analyticsStorageKey) === input.adminViewCountThreshold ? 'automatic' : 'manual',
        reviewerId: reviewerId || 'admin', reviewedAt: new Date().toISOString() },
    } : submission.audienceCheck
    const expected = sprintReviewItems(submission.sprintTerms, submission.formatId || '', false, submission.createdAt)
    if (expected.length && input.reviewChecklist.some(item => item.id === AUDIENCE_MINIMUM_REJECTION.id)) expected.push(AUDIENCE_MINIMUM_REJECTION)
    // An open admin tab may still send rules retired since the modal was loaded.
    // Discard only known retired rules; preserve every current result, including unmet ones.
    const currentIds = new Set(expected.map(item => item.id))
    const retiredIds = new Set(sprintReviewItems(submission.sprintTerms, submission.formatId || '', true).filter(item => !currentIds.has(item.id)).map(item => item.id))
    const reviewChecklist = input.reviewChecklist.filter(item => !retiredIds.has(item.id))
    const ids = new Set(reviewChecklist.map(item => item.id))
    if (!expected.length || ids.size !== expected.length || reviewChecklist.length !== expected.length || expected.some(item => !ids.has(item.id))) throw new ApiError(400, 'The review requirements changed. Refresh the page and reopen the submission. Unmet requirements can stay unchecked.')
    const reviewError = submissionReviewError(input.status, reviewChecklist.map(item => ({ ...item, waived: expected.find(rule => rule.id === item.id)?.waived })))
    if (reviewError) throw new ApiError(400, reviewError)
    const calculated = sprintPayoutCents(submission.sprintTerms, input.adminViewCountThreshold, input.adminUsAudiencePercent)
    const preservedCents = submission.campaignPayoutCorrected || submission.reviewRequestedAt || payments.some(payment => payment.status === 'paid') ? submission.approvedAmountCents || 0 : 0
    if (submission.sprintTerms.retainer && input.status === 'approved' && input.approvedAmountCents != null && input.approvedAmountCents !== Math.max(preservedCents, calculated)) throw new ApiError(400, 'Retainer earnings are fixed by the saved agreement and verified audience; reject an ineligible post instead of changing its rate.')
    if (input.approveWithoutPayment) {
      if (input.status !== 'approved' || !submission.reviewRequestedAt || !preservedCents) throw new ApiError(400, 'No-payment approval is only available for a paid rereview')
      if (remainingCreatorPaymentCents(preservedCents, payments) !== 0) throw new ApiError(409, 'Existing approved earnings must be paid before closing a rereview without payment')
      if (calculated > preservedCents) throw new ApiError(400, 'This rereview has additional eligible earnings')
      if (!input.reviewNote?.trim()) throw new ApiError(400, 'Explain why this rereview receives no additional payment')
    }
    if (input.status === 'approved' && !calculated && !input.approveWithoutPayment && !input.reviewNote?.trim()) throw new ApiError(400, 'Explain why this video receives no payment')
    const amountCents = input.status === 'approved'
      ? input.approveWithoutPayment
        ? preservedCents
        : reviewedPayoutCents(input, input.approvedAmountCents == null ? Math.max(preservedCents, calculated) : calculated, payments, submission.campaignPayoutCorrected ? submission.approvedAmountCents ?? 0 : undefined)
      : preservedCents || null

    if ((amountCents ?? 0) < (submission.approvedAmountCents ?? 0)) {
      const corrected = await tx.query.creatorSubmissions.findFirst({
        where: and(eq(schema.creatorSubmissions.creatorProfileId, creatorId), eq(schema.creatorSubmissions.campaignPayoutCorrected, true)),
        columns: { id: true },
      })
      if (corrected) throw new ApiError(409, 'Lowering an approval on this account requires a campaign correction')
    }

    const budgetOwner = await lockCampaignBudget(tx, submission.sprintId)
    const [sprint] = await tx.select().from(schema.creatorSprints).where(eq(schema.creatorSprints.id, submission.sprintId)).for('update')
    if (!sprint) throw new ApiError(404, 'Sprint not found')
    const [used] = await tx.execute<{ cents: number; other_pending_cents: number }>(sql`select ${campaignCommittedCents(sprint.id)} as cents, ${campaignPendingCents(sprint.id, submission.id)} as other_pending_cents`)
    const [transfer] = await tx.execute<{ amount_cents: number }>(sql`select amount_cents from creator_campaign_transfers where submission_id = ${submission.id}`)
    if (!submission.campaignPayoutCorrected && (amountCents || 0) < (transfer?.amount_cents ?? 0)) throw new ApiError(409, 'Previously approved earnings from the original campaign must be preserved')
    const previous = submission.approvedAmountCents || 0
    const nextPendingCents = ['pending', 'in_review'].includes(input.status)
      ? Math.max(0, sprintPayoutCents(submission.sprintTerms, submission.viewCountThreshold ?? 0, submission.usAudiencePercent) - (amountCents || 0)) : 0
    const allocatedAfterReview = used.cents - previous + (amountCents || 0) + (used.other_pending_cents ?? 0) + nextPendingCents
    if (input.status !== 'rejected' && allocatedAfterReview > budgetOwner.budget_cents) throw new ApiError(409, 'This review would exceed the shared campaign budget after pending requests')
    const [record] = await tx.update(schema.creatorSubmissions).set({ audienceCheck, status: input.status, reviewRequestedAt: ['approved', 'rejected'].includes(input.status) ? null : submission.reviewRequestedAt, approvedAmountCents: amountCents, adminViewCountThreshold: input.adminViewCountThreshold, adminUsAudiencePercent: input.adminUsAudiencePercent, reviewChecklist: reviewChecklist.map(item => ({ ...item, note: item.note || null })), reviewNote: input.reviewNote || null, updatedAt: new Date() }).where(eq(schema.creatorSubmissions.id, submission.id)).returning()
    await appendReviewMessage(tx, submission, input.reviewNote, reviewerId)
    await recordReviewUpdate(tx, submission, { ...input, approvedAmountCents: record.approvedAmountCents })
    return record
  })
}
async function createSprintPayment(input: CreatorAdminPaymentInput, receiptImage: string | null, creatorId: string) {
  return db.transaction(async tx => {
    const [profile] = await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, creatorId)).for('update')
    const [submission] = await tx.select().from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.id, input.submissionId)).for('update')
    if (!submission || submission.status !== 'approved' || !submission.approvedAmountCents) throw new ApiError(409, 'Approve eligible earnings before scheduling a payment')
    const { unpaid, payments, overpaymentCents } = await creatorContentPayout(tx, creatorId)
    if (payments.some(payment => payment.submissionId === submission.id && ['pending', 'processing'].includes(payment.status))) throw new ApiError(409, 'A payment is already scheduled for this submission')
    const amountCents = unpaid.get(submission.id) ?? 0
    if (input.expectedAmountCents !== undefined && amountCents !== input.expectedAmountCents) throw new ApiError(409, 'The payout changed. Refresh before recording payment.')
    if (!amountCents) throw new ApiError(409, overpaymentCents ? 'No approved earnings remain after payments and balance offsets' : 'All approved earnings have already been paid')
    if (!profile || !canReceiveCreatorPayout(profile)) throw new ApiError(409, 'Save a complete payout method and ensure creator access is active')
    if (profile.bundledPayouts) throw new ApiError(409, 'This creator uses bundled payouts. Wait for their payout request.')
    if (input.adminViewCountThreshold !== submission.adminViewCountThreshold || input.adminUsAudiencePercent !== submission.adminUsAudiencePercent) throw new ApiError(409, 'Use the approved earnings values')
    const [payment] = await tx.insert(schema.creatorPayments).values({ creatorProfileId: profile.id, submissionId: submission.id, amountCents, paymentOption: profile.paymentOption, status: input.status, providerReference: input.providerReference || null, paidAt: input.status === 'paid' ? new Date() : null }).returning()
    if (receiptImage) {
      if (profile.paymentOption !== 'paypal') throw new ApiError(400, 'Image receipts are for PayPal payments')
      await tx.insert(schema.creatorPaymentReceipts).values({ paymentId: payment.id, image: receiptImage })
    }
    if (input.status === 'paid' && remainingCreatorPaymentCents(submission.approvedAmountCents, [...payments.filter(item => item.submissionId === submission.id), payment], false) === 0) await tx.update(schema.creatorSubmissions).set({ status: 'paid', updatedAt: new Date() }).where(eq(schema.creatorSubmissions.id, submission.id))
    return payment
  })
}

async function appendReviewMessage(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], submission: { id: string; reviewNote: string | null }, note: string | null | undefined, reviewerId?: string) {
  const body = note?.trim()
  if (body && body !== submission.reviewNote?.trim()) {
    await tx.insert(schema.creatorSubmissionMessages).values({ submissionId: submission.id, authorRole: 'team', authorUserId: reviewerId || null, body })
  }
}
