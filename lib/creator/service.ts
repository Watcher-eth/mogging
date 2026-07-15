import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '@/lib/db'

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
  title: z.string().trim().min(2).max(120),
  socialAccountId: z.string().uuid(),
  caption: z.string().trim().max(2200).optional().nullable(),
  postUrl: z.union([z.literal(''), z.string().url()]).optional().nullable(),
  videoUrl: z.string().min(1),
  videoStorageKey: z.string().min(1),
  videoContentType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
  videoSizeBytes: z.number().int().positive().max(500 * 1024 * 1024),
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
}).extend(creatorAnalyticsEvidenceSchema.shape)

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>
export type CreatorSubmissionInput = z.infer<typeof creatorSubmissionSchema>
export type CreatorSocialAccountInput = z.infer<typeof creatorSocialAccountSchema>
export type CreatorAnalyticsEvidenceInput = z.infer<typeof creatorAnalyticsEvidenceSchema>

export type CreatorTikTokOAuthInput = CreatorAnalyticsEvidenceInput & {
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
  const profile = await getCreatorProfile(userId)
  if (!profile) return { profile: null, submissions: [], payments: [], socialAccounts: [] }

  const [submissions, payments, socialAccounts] = await Promise.all([
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
    }),
  ])

  return { profile, submissions, payments, socialAccounts }
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
  validateCreatorAnalyticsEvidence(userId, input)
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
      ...creatorAnalyticsEvidenceValues(input),
    })
    .returning()
  return account
}

export async function addCreatorTikTokOAuthAccount(userId: string, input: CreatorTikTokOAuthInput) {
  validateCreatorAnalyticsEvidence(userId, input)
  const profile = await getOrCreateCreatorProfile(userId)
  const normalizedHandle = input.username.replace(/^@/, '').trim().toLowerCase()
  if (!/^[a-z0-9._]{2,40}$/.test(normalizedHandle)) {
    throw new CreatorServiceError(400, 'TikTok returned an invalid username')
  }

  return db.transaction(async (tx) => {
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
      ...creatorAnalyticsEvidenceValues(input),
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
  const [account] = await db
    .delete(schema.creatorSocialAccounts)
    .where(and(
      eq(schema.creatorSocialAccounts.id, accountId),
      eq(schema.creatorSocialAccounts.creatorProfileId, profile.id)
    ))
    .returning()
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

async function getOrCreateCreatorProfile(userId: string) {
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
  const profile = await getCreatorProfile(userId)
  if (!profile) throw new CreatorServiceError(409, 'Connect a TikTok or Instagram account before submitting')
  if (!input.videoStorageKey.startsWith(`creators/${userId}/`)) {
    throw new CreatorServiceError(400, 'Invalid video upload')
  }
  const socialAccount = await db.query.creatorSocialAccounts.findFirst({
    where: and(
      eq(schema.creatorSocialAccounts.id, input.socialAccountId),
      eq(schema.creatorSocialAccounts.creatorProfileId, profile.id)
    ),
  })
  if (!socialAccount) {
    throw new CreatorServiceError(409, 'Select one of your connected TikTok or Instagram accounts')
  }

  const [submission] = await db
    .insert(schema.creatorSubmissions)
    .values({
      creatorProfileId: profile.id,
      socialAccountId: socialAccount.id,
      title: input.title,
      platform: socialAccount.platform === 'tiktok' ? 'TikTok' : 'Instagram Reels',
      caption: input.caption || null,
      postUrl: input.postUrl || null,
      videoUrl: input.videoUrl,
      videoStorageKey: input.videoStorageKey,
      videoContentType: input.videoContentType,
      videoSizeBytes: input.videoSizeBytes,
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
