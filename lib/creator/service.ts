import { and, desc, eq, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { getCreatorSubmissionFormat } from '@/lib/creator/formats'
import { ensureCreatorTrackingLink } from '@/lib/creator/attribution'

export const creatorProfileSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80),
    socialHandle: z.string().trim().max(120).optional().nullable(),
    paymentOption: z.enum(['paypal', 'crypto']),
    paypalEmail: z.string().trim().email().optional().nullable(),
    cryptoNetwork: z.string().trim().max(40).optional().nullable(),
    cryptoWalletAddress: z.string().trim().max(180).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.paymentOption === 'paypal' && !value.paypalEmail) {
      ctx.addIssue({ code: 'custom', path: ['paypalEmail'], message: 'PayPal email is required' })
    }
    if (value.paymentOption === 'crypto' && (!value.cryptoNetwork || !value.cryptoWalletAddress)) {
      ctx.addIssue({ code: 'custom', path: ['cryptoWalletAddress'], message: 'Network and wallet address are required' })
    }
  })

export const creatorSubmissionSchema = z.object({
  formatId: z.string().trim().min(1).max(80),
  requirementsConfirmed: z.literal(true),
  socialAccountId: z.string().uuid().optional().nullable(),
  postUrl: z.string().url(),
  analyticsScreenshotUrl: z.string().min(1),
  analyticsStorageKey: z.string().min(1),
  analyticsContentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  analyticsSizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
  viewCountThreshold: z.number().int().positive().max(2_000_000_000),
  usAudiencePercent: z.number().min(22.5).max(40).multipleOf(2.5).optional().nullable(),
})

export const creatorAnalyticsEvidenceSchema = z.object({
  analyticsVideoUrl: z.string().min(1),
  analyticsStorageKey: z.string().min(1),
  analyticsContentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  analyticsSizeBytes: z.number().int().positive().max(250 * 1024 * 1024),
  analyticsPast28DaysConfirmed: z.literal(true),
})

export const creatorSocialAccountSchema = z.object({
  platform: z.enum(['tiktok', 'instagram']),
  handle: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((value) => value.replace(/^@/, '').toLowerCase())
    .refine((value) => /^[a-z0-9._]+$/.test(value), 'Enter a valid username'),
  profileUrl: z.union([z.literal(''), z.string().url()]).optional().nullable(),
})

export const creatorAccountAnalyticsSubmissionSchema = creatorAnalyticsEvidenceSchema.extend({
  accountId: z.string().uuid(),
})

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>
export type CreatorSubmissionInput = z.infer<typeof creatorSubmissionSchema>
export type CreatorSocialAccountInput = z.infer<typeof creatorSocialAccountSchema>
export type CreatorAnalyticsEvidenceInput = z.infer<typeof creatorAnalyticsEvidenceSchema>

export type CreatorTikTokOAuthInput = {
  accessToken: string
  expiresIn?: number
  openId: string
  refreshToken?: string
  scope?: string
  tokenType?: string
  username: string
  profileUrl: string
  avatarUrl?: string | null
}

export async function getCreatorDashboard(userId: string) {
  const communityMetricsPromise = getCreatorCommunityMetrics()
  const profile = await getCreatorProfile(userId)
  const featureFlags = {
    creatorAccountRequiredForSubmission: env.CREATOR_ACCOUNT_REQUIRED_FOR_SUBMISSION,
  }
  if (!profile) return { profile: null, submissions: [], payments: [], socialAccounts: [], communityMetrics: await communityMetricsPromise, featureFlags }

  const [submissions, payments, socialAccounts, communityMetrics] = await Promise.all([
    db.query.creatorSubmissions.findMany({
      where: eq(schema.creatorSubmissions.creatorProfileId, profile.id),
      orderBy: [desc(schema.creatorSubmissions.createdAt)],
    }),
    db.query.creatorPayments.findMany({
      where: eq(schema.creatorPayments.creatorProfileId, profile.id),
      orderBy: [desc(schema.creatorPayments.createdAt)],
    }),
    db.query.creatorSocialAccounts.findMany({
      where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id),
      orderBy: [desc(schema.creatorSocialAccounts.createdAt)],
      with: { trackingLink: true },
    }),
    communityMetricsPromise,
  ])

  const socialAccountsWithLinks = await Promise.all(socialAccounts.map(async (account) => {
    if (account.trackingLink?.isActive) return account
    return { ...account, trackingLink: await ensureCreatorTrackingLink(account.id) }
  }))

  return { profile, submissions, payments, socialAccounts: socialAccountsWithLinks, communityMetrics, featureFlags }
}

async function getCreatorCommunityMetrics() {
  const [viewMetrics, paymentMetrics, submissionMetrics] = await Promise.all([
    db
      .select({
        totalQualifiedViews: sql<number>`coalesce(sum(${schema.creatorAttributionMetrics.qualifiedViews}), 0)::float8`,
        totalFirstTimePaidCustomers: sql<number>`coalesce(sum(${schema.creatorAttributionMetrics.firstTimePaidCustomers}), 0)::float8`,
      })
      .from(schema.creatorAttributionMetrics),
    db
      .select({
        totalPaidCents: sql<number>`coalesce(sum(${schema.creatorPayments.amountCents}), 0)::float8`,
        paidCreators: sql<number>`count(distinct ${schema.creatorPayments.creatorProfileId})::int`,
      })
      .from(schema.creatorPayments)
      .where(eq(schema.creatorPayments.status, 'paid')),
    db
      .select({ approvedSubmissions: sql<number>`count(*)::int` })
      .from(schema.creatorSubmissions)
      .where(or(eq(schema.creatorSubmissions.status, 'approved'), eq(schema.creatorSubmissions.status, 'paid'))),
  ])

  return {
    totalQualifiedViews: viewMetrics[0]?.totalQualifiedViews || 0,
    totalFirstTimePaidCustomers: viewMetrics[0]?.totalFirstTimePaidCustomers || 0,
    totalPaidCents: paymentMetrics[0]?.totalPaidCents || 0,
    paidCreators: paymentMetrics[0]?.paidCreators || 0,
    approvedSubmissions: submissionMetrics[0]?.approvedSubmissions || 0,
  }
}

export function getCreatorProfile(userId: string) {
  return db.query.creatorProfiles.findFirst({
    where: eq(schema.creatorProfiles.userId, userId),
  })
}

export async function saveCreatorProfile(userId: string, input: CreatorProfileInput) {
  const values = {
    userId,
    displayName: input.displayName,
    socialHandle: input.socialHandle || null,
    paymentOption: input.paymentOption,
    paypalEmail: input.paymentOption === 'paypal' ? input.paypalEmail : null,
    cryptoNetwork: input.paymentOption === 'crypto' ? input.cryptoNetwork : null,
    cryptoWalletAddress: input.paymentOption === 'crypto' ? input.cryptoWalletAddress : null,
    updatedAt: new Date(),
  } as const

  const [profile] = await db
    .insert(schema.creatorProfiles)
    .values(values)
    .onConflictDoUpdate({ target: schema.creatorProfiles.userId, set: values })
    .returning()

  return profile
}

export async function addCreatorSocialAccount(userId: string, input: CreatorSocialAccountInput) {
  const profile = await getOrCreateCreatorProfile(userId)
  const accounts = await db.query.creatorSocialAccounts.findMany({
    where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id),
  })
  const platformAccounts = accounts.filter((account) => account.platform === input.platform)
  if (accounts.length >= 10 || platformAccounts.length >= 5) {
    throw new CreatorServiceError(409, `You can connect up to 5 ${input.platform === 'tiktok' ? 'TikTok' : 'Instagram'} accounts`)
  }
  if (platformAccounts.some((account) => account.handle === input.handle)) {
    throw new CreatorServiceError(409, 'This account is already connected')
  }

  const [account] = await db
    .insert(schema.creatorSocialAccounts)
    .values({
      creatorProfileId: profile.id,
      platform: input.platform,
      handle: input.handle,
      profileUrl: input.profileUrl || null,
    })
    .returning()
  return { ...account, trackingLink: await ensureCreatorTrackingLink(account.id) }
}

export async function addCreatorTikTokOAuthAccount(userId: string, input: CreatorTikTokOAuthInput) {
  const profile = await getOrCreateCreatorProfile(userId)
  const normalizedHandle = input.username.replace(/^@/, '').trim().toLowerCase()
  if (!/^[a-z0-9._]{2,40}$/.test(normalizedHandle)) {
    throw new CreatorServiceError(400, 'TikTok returned an invalid username')
  }

  const account = await db.transaction(async (tx) => {
    const accounts = await tx.query.creatorSocialAccounts.findMany({
      where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id),
    })
    const existingSocialAccount = await tx.query.creatorSocialAccounts.findFirst({
      where: and(
        eq(schema.creatorSocialAccounts.platform, 'tiktok'),
        eq(schema.creatorSocialAccounts.providerAccountId, input.openId)
      ),
    })
    if (existingSocialAccount && existingSocialAccount.creatorProfileId !== profile.id) {
      throw new CreatorServiceError(409, 'This TikTok account is already connected to another creator')
    }

    const handleAccount = accounts.find((account) => account.platform === 'tiktok' && account.handle === normalizedHandle)
    const accountToUpdate = existingSocialAccount || handleAccount
    const tiktokAccounts = accounts.filter((account) => account.platform === 'tiktok')
    if (!accountToUpdate && (accounts.length >= 10 || tiktokAccounts.length >= 5)) {
      throw new CreatorServiceError(409, 'You can connect up to 5 TikTok accounts')
    }

    const existingTokenAccount = await tx.query.accounts.findFirst({
      where: and(
        eq(schema.accounts.provider, 'tiktok-creator'),
        eq(schema.accounts.providerAccountId, input.openId)
      ),
    })
    if (existingTokenAccount && existingTokenAccount.userId !== userId) {
      throw new CreatorServiceError(409, 'This TikTok authorization belongs to another Mogging account')
    }

    const tokenValues = {
      userId,
      type: 'oauth' as const,
      provider: 'tiktok-creator',
      providerAccountId: input.openId,
      access_token: input.accessToken,
      refresh_token: input.refreshToken || null,
      expires_at: input.expiresIn ? Math.floor(Date.now() / 1000) + input.expiresIn : null,
      token_type: input.tokenType || 'Bearer',
      scope: input.scope?.replaceAll(',', ' ') || null,
    }
    await tx.insert(schema.accounts).values(tokenValues).onConflictDoUpdate({
      target: [schema.accounts.provider, schema.accounts.providerAccountId],
      set: tokenValues,
    })

    const socialValues = {
      handle: normalizedHandle,
      profileUrl: input.profileUrl,
      avatarUrl: input.avatarUrl || null,
      connectionMethod: 'oauth',
      providerAccountId: input.openId,
      oauthVerifiedAt: new Date(),
      updatedAt: new Date(),
    }
    if (accountToUpdate) {
      const [account] = await tx.update(schema.creatorSocialAccounts).set(socialValues).where(eq(schema.creatorSocialAccounts.id, accountToUpdate.id)).returning()
      return account
    }
    const [account] = await tx.insert(schema.creatorSocialAccounts).values({
      creatorProfileId: profile.id,
      platform: 'tiktok',
      ...socialValues,
    }).returning()
    return account
  })
  return { ...account, trackingLink: await ensureCreatorTrackingLink(account.id) }
}

export async function submitCreatorAccountAnalyticsEvidence(userId: string, input: z.infer<typeof creatorAccountAnalyticsSubmissionSchema>) {
  validateCreatorAnalyticsEvidence(userId, input)
  const profile = await getCreatorProfile(userId)
  if (!profile) throw new CreatorServiceError(404, 'Creator profile not found')
  const [account] = await db
    .update(schema.creatorSocialAccounts)
    .set({
      ...creatorAnalyticsEvidenceValues(input),
      status: 'pending',
      reviewNote: null,
      updatedAt: new Date(),
    })
    .where(and(
      eq(schema.creatorSocialAccounts.id, input.accountId),
      eq(schema.creatorSocialAccounts.creatorProfileId, profile.id)
    ))
    .returning()
  if (!account) throw new CreatorServiceError(404, 'Connected account not found')
  return account
}

function validateCreatorAnalyticsEvidence(userId: string, input: z.infer<typeof creatorAnalyticsEvidenceSchema>) {
  if (!input.analyticsStorageKey.startsWith(`creators/${userId}/account-analytics/`)) {
    throw new CreatorServiceError(400, 'Invalid analytics recording upload')
  }
}

function creatorAnalyticsEvidenceValues(input: z.infer<typeof creatorAnalyticsEvidenceSchema>) {
  return {
    analyticsVideoUrl: input.analyticsVideoUrl,
    analyticsStorageKey: input.analyticsStorageKey,
    analyticsContentType: input.analyticsContentType,
    analyticsSizeBytes: input.analyticsSizeBytes,
    analyticsPeriodDays: 28,
    analyticsConfirmedAt: new Date(),
  }
}

export async function removeCreatorSocialAccount(userId: string, accountId: string) {
  const profile = await getCreatorProfile(userId)
  if (!profile) throw new CreatorServiceError(404, 'Creator profile not found')
  const account = await db.transaction(async (tx) => {
    const existing = await tx.query.creatorSocialAccounts.findFirst({
      where: and(
        eq(schema.creatorSocialAccounts.id, accountId),
        eq(schema.creatorSocialAccounts.creatorProfileId, profile.id)
      ),
    })
    if (!existing) return null
    await tx.delete(schema.creatorTrackingLinks).where(eq(schema.creatorTrackingLinks.socialAccountId, accountId))
    const [deleted] = await tx.delete(schema.creatorSocialAccounts).where(eq(schema.creatorSocialAccounts.id, accountId)).returning()
    return deleted
  })
  if (!account) throw new CreatorServiceError(404, 'Connected account not found')
  if (account.platform === 'tiktok' && account.connectionMethod === 'oauth' && account.providerAccountId) {
    await db.delete(schema.accounts).where(and(
      eq(schema.accounts.userId, userId),
      eq(schema.accounts.provider, 'tiktok-creator'),
      eq(schema.accounts.providerAccountId, account.providerAccountId)
    ))
  }
  return account
}

export async function getCreatorTikTokAccessToken(userId: string, accountId: string) {
  const profile = await getCreatorProfile(userId)
  if (!profile) return null
  const account = await db.query.creatorSocialAccounts.findFirst({
    where: and(
      eq(schema.creatorSocialAccounts.id, accountId),
      eq(schema.creatorSocialAccounts.creatorProfileId, profile.id),
      eq(schema.creatorSocialAccounts.platform, 'tiktok')
    ),
  })
  if (!account?.providerAccountId || account.connectionMethod !== 'oauth') return null
  const tokenAccount = await db.query.accounts.findFirst({
    where: and(
      eq(schema.accounts.userId, userId),
      eq(schema.accounts.provider, 'tiktok-creator'),
      eq(schema.accounts.providerAccountId, account.providerAccountId)
    ),
  })
  return tokenAccount?.access_token || null
}

export async function getOrCreateCreatorProfile(userId: string) {
  const existing = await getCreatorProfile(userId)
  if (existing) return existing
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  if (!user) throw new CreatorServiceError(404, 'User not found')
  const [profile] = await db
    .insert(schema.creatorProfiles)
    .values({
      userId,
      displayName: user.name || user.email.split('@')[0],
      socialHandle: user.instagramUsername,
      paypalEmail: user.email,
    })
    .returning()
  return profile
}

export async function createCreatorSubmission(userId: string, input: CreatorSubmissionInput) {
  const format = getCreatorSubmissionFormat(input.formatId)
  if (!format) throw new CreatorServiceError(409, 'Choose an available submission format')
  const profile = await getOrCreateCreatorProfile(userId)
  if (!input.analyticsStorageKey.startsWith(`creators/${userId}/submission-analytics/`)) {
    throw new CreatorServiceError(400, 'Invalid analytics screenshot upload')
  }
  const socialAccount = input.socialAccountId ? await db.query.creatorSocialAccounts.findFirst({
    where: and(
      eq(schema.creatorSocialAccounts.id, input.socialAccountId),
      eq(schema.creatorSocialAccounts.creatorProfileId, profile.id)
    ),
  }) : null
  if (input.socialAccountId && !socialAccount) {
    throw new CreatorServiceError(409, 'Select one of your connected TikTok or Instagram accounts')
  }
  if (env.CREATOR_ACCOUNT_REQUIRED_FOR_SUBMISSION && !socialAccount) {
    throw new CreatorServiceError(409, 'Connect a TikTok or Instagram account before submitting')
  }

  const [submission] = await db
    .insert(schema.creatorSubmissions)
    .values({
      creatorProfileId: profile.id,
      socialAccountId: socialAccount?.id || null,
      formatId: format.id,
      requirementsConfirmedAt: new Date(),
      title: format.name,
      platform: socialAccount ? (socialAccount.platform === 'tiktok' ? 'TikTok' : 'Instagram Reels') : 'Unlinked',
      caption: null,
      postUrl: input.postUrl,
      videoUrl: null,
      videoStorageKey: null,
      videoContentType: null,
      videoSizeBytes: null,
      analyticsScreenshotUrl: input.analyticsScreenshotUrl,
      analyticsStorageKey: input.analyticsStorageKey,
      analyticsContentType: input.analyticsContentType,
      analyticsSizeBytes: input.analyticsSizeBytes,
      viewCountThreshold: input.viewCountThreshold,
      usAudiencePercent: input.usAudiencePercent ?? null,
    })
    .returning()

  return submission
}

export async function getSubmissionForCreator(userId: string, submissionId: string) {
  const profile = await getCreatorProfile(userId)
  if (!profile) return null
  return db.query.creatorSubmissions.findFirst({
    where: and(
      eq(schema.creatorSubmissions.id, submissionId),
      eq(schema.creatorSubmissions.creatorProfileId, profile.id)
    ),
  })
}

export class CreatorServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
  }
}
