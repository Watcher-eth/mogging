import { getCreatorSubmissionUpdates, recordSubmissionUpdate } from './submission-updates'
import { resolveCreatorPostLink, rethrowCreatorPostConflict } from './post-identity'
import { accountFollowers, followersFromOAuth, publishingTikTokHandle, tiktokAnchorEligible, TIKTOK_ANCHOR_REQUIREMENTS_ENABLED, TIKTOK_ANCHOR_REQUIREMENT } from './tiktok-anchor'
import { resolveTikTokFollowers } from './tiktok-followers'
import { submissionUnreadCount } from '@/lib/creator/submission-messages'
import { sprintPhase, sprintFormat } from './sprints'
import type { TikTokUserInfo } from '@/lib/auth/tiktok-api'
import { creatorAssetPublicUrl, verifyCreatorRecordingUpload } from '@/lib/storage/videos'
import { and, desc, eq, getTableColumns, or, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { creatorReferralHandle, ensureCreatorTrackingLink } from '@/lib/creator/attribution'
import { captionContainsCreatorCode } from './post-guidance'

export { creatorProfileSchema, creatorSubmissionSchema, creatorSocialAccountSchema } from './validation'
import { creatorSubmissionAnalyticsSchema, type CreatorSubmissionAnalyticsInput, creatorSubmissionSchema, creatorPostPlatform, type CreatorProfileInput, type CreatorSubmissionInput, type CreatorSocialAccountInput } from './validation'

export type CreatorTikTokOAuthInput = {
  accessToken: string
  expiresIn?: number
  openId: string
  refreshToken?: string
  scope?: string
  tokenType?: string
  profile: TikTokUserInfo
}

export async function getCreatorDashboard(userId: string) {
  const communityMetricsPromise = getCreatorCommunityMetrics()
  const profile = await getCreatorProfile(userId)
  const featureFlags = {
    creatorAccountRequiredForSubmission: env.CREATOR_ACCOUNT_REQUIRED_FOR_SUBMISSION,
  }
  if (!profile) return { profile: null, submissions: [], payments: [], payoutRequests: [], updates: [], socialAccounts: [], communityMetrics: await communityMetricsPromise, featureFlags }

  const [submissions, payments, socialAccounts, communityMetrics, payoutRequests, updates] = await Promise.all([
    db.select({ ...getTableColumns(schema.creatorSubmissions), unreadMessages: submissionUnreadCount('creator') })
      .from(schema.creatorSubmissions).where(and(eq(schema.creatorSubmissions.creatorProfileId, profile.id), eq(schema.creatorSubmissions.isDraft, false))).orderBy(desc(schema.creatorSubmissions.createdAt)),
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
    db.query.creatorPayoutRequests.findMany({ where: eq(schema.creatorPayoutRequests.creatorProfileId, profile.id), orderBy: [desc(schema.creatorPayoutRequests.requestedAt)], limit: 100 }),
    getCreatorSubmissionUpdates(profile.id),
  ])

  const socialAccountsWithLinks = await Promise.all(socialAccounts.map(async (account) => {
    account = { ...account, followers: account.platform === 'tiktok' ? accountFollowers(account) : null }
    const handle = creatorReferralHandle(account.handle)
    if (!handle) return { ...account, trackingLink: null }
    if (account.trackingLink?.isActive && account.trackingLink.publicUrl === `https://www.mogging.com/r/${handle}`) return account
    return { ...account, trackingLink: await ensureCreatorTrackingLink(account.id) }
  }))

  return { profile, submissions, payments, payoutRequests, updates, socialAccounts: socialAccountsWithLinks, communityMetrics, featureFlags }
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
    paypalMeUrl: input.paymentOption === 'paypal' ? input.paypalMeUrl || null : null,
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
  if (profile.authStatus === 'suspended') throw new CreatorServiceError(403, 'Your creator account is suspended')
  const { fetchAccountAvatar } = await import('./account-avatars')
  const [followers, avatarUrl] = await Promise.all([
    input.platform === 'tiktok' ? resolveTikTokFollowers(input.handle, input.followerRange) : null,
    fetchAccountAvatar(input.platform, input.handle),
  ])
  if (input.platform === 'tiktok' && !followers) throw new CreatorServiceError(400, 'Choose your TikTok follower range to connect this account')
  const account = await db.transaction(async tx => {
    // Serialize both account-limit checks and handle claims across concurrent requests.
    await tx.execute(sql`select id from creator_profiles where id = ${profile.id} for update`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${input.platform}:${input.handle}`}, 0))`)
    const claimed = await tx.query.creatorSocialAccounts.findFirst({ where: and(eq(schema.creatorSocialAccounts.platform, input.platform), eq(schema.creatorSocialAccounts.handle, input.handle)) })
    if (claimed) {
      if (claimed.creatorProfileId === profile.id) {
        if (!avatarUrl) return claimed
        const [updated] = await tx.update(schema.creatorSocialAccounts).set({ avatarUrl, avatarCheckedAt: new Date() }).where(eq(schema.creatorSocialAccounts.id, claimed.id)).returning()
        return updated
      }
      throw new CreatorServiceError(409, 'This profile is already connected to another creator')
    }
    const accounts = await tx.query.creatorSocialAccounts.findMany({ where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id) })
    if (accounts.length >= 10 || accounts.filter(item => item.platform === input.platform).length >= 5) throw new CreatorServiceError(409, 'You can connect up to five accounts per platform')
    const [created] = await tx.insert(schema.creatorSocialAccounts).values({ creatorProfileId: profile.id, platform: input.platform, status: 'approved', handle: input.handle, followers, avatarUrl, avatarCheckedAt: new Date(), profileUrl: input.profileUrl || `https://www.${input.platform}.com/${input.platform === 'tiktok' ? '@' : ''}${input.handle}` }).returning()
    return created
  })
  return { ...account, trackingLink: await ensureCreatorTrackingLink(account.id) }
}

export async function addCreatorTikTokOAuthAccount(userId: string, input: CreatorTikTokOAuthInput) {
  const profile = await getOrCreateCreatorProfile(userId)
  const normalizedHandle = input.profile.username?.replace(/^@/, '').trim().toLowerCase()
  if (normalizedHandle !== undefined && !/^[a-z0-9._]{2,40}$/.test(normalizedHandle)) {
    throw new CreatorServiceError(400, 'TikTok returned an invalid username')
  }

  const { fetchAccountAvatar } = await import('./account-avatars')
  const avatarUrl = await fetchAccountAvatar('tiktok', normalizedHandle || null, input.profile.avatar_large_url || input.profile.avatar_url_100 || input.profile.avatar_url)

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

    const handleAccount = normalizedHandle ? accounts.find((account) => account.platform === 'tiktok' && account.handle === normalizedHandle) : undefined
    if (handleAccount?.providerAccountId && handleAccount.providerAccountId !== input.openId) {
      throw new CreatorServiceError(409, 'This username is connected to a different TikTok account')
    }
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
      followers: followersFromOAuth(input.profile) || accountToUpdate?.followers || null,
      // OAuth proves the provider identity even when profile scope is unavailable.
      // Preserve known handles on reconnect; never invent a username from display_name.
      handle: normalizedHandle || accountToUpdate?.handle || null,
      displayName: input.profile.display_name || accountToUpdate?.displayName || null,
      profileUrl: input.profile.profile_deep_link || (normalizedHandle ? `https://www.tiktok.com/@${normalizedHandle}` : accountToUpdate?.profileUrl || null),
      avatarUrl: avatarUrl || accountToUpdate?.avatarUrl || null,
      avatarCheckedAt: new Date(),
      oauthProfile: { ...accountToUpdate?.oauthProfile, ...input.profile },
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
    // Keep a shared referral identity when its original publishing account is removed.
    const siblings = existing.handle ? await tx.query.creatorSocialAccounts.findMany({
      where: and(eq(schema.creatorSocialAccounts.creatorProfileId, profile.id), eq(schema.creatorSocialAccounts.handle, existing.handle)),
    }) : []
    const replacement = siblings.find(account => account.id !== accountId)
    if (replacement) {
      await tx.update(schema.creatorTrackingLinks).set({ socialAccountId: replacement.id, updatedAt: new Date() })
        .where(eq(schema.creatorTrackingLinks.socialAccountId, accountId))
    } else {
      await tx.delete(schema.creatorTrackingLinks).where(eq(schema.creatorTrackingLinks.socialAccountId, accountId))
    }
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
    })
    .onConflictDoNothing({ target: schema.creatorProfiles.userId })
    .returning()
  // Concurrent Studio visits or account connections share the same registration.
  if (profile) return profile
  const registered = await getCreatorProfile(userId)
  if (!registered) throw new CreatorServiceError(500, 'Could not register creator')
  return registered
}

export async function createCreatorSubmission(userId: string, input: CreatorSubmissionInput) {
  input = creatorSubmissionSchema.parse(input)
  const profile = await getOrCreateCreatorProfile(userId)
  if (profile.authStatus === 'suspended') throw new CreatorServiceError(403, 'Your creator account is suspended')
  const sprint = await db.query.creatorSprints.findFirst({ where: eq(schema.creatorSprints.id, input.sprintId) })
  if (!sprint || sprintPhase({ ...sprint, startsAt: sprint.startsAt.toISOString(), endsAt: sprint.endsAt.toISOString() }) !== 'active') throw new CreatorServiceError(409, 'Choose an active campaign')
  const format = sprintFormat(sprint.terms, input.formatId)
  if (!format) throw new CreatorServiceError(400, 'Choose a format offered by this campaign')
  if (!sprint.terms.platforms.includes(creatorPostPlatform(input.postUrl)!)) throw new CreatorServiceError(400, 'This platform is not accepted by the campaign')
  let socialAccount = input.socialAccountId ? await db.query.creatorSocialAccounts.findFirst({
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

  if (socialAccount && creatorPostPlatform(input.postUrl) !== socialAccount.platform) {
    throw new CreatorServiceError(400, 'The post link must match the selected account’s platform')
  }

  let postLink: { key: string; url: string }
  try { postLink = await resolveCreatorPostLink(input.postUrl) }
  catch { throw new CreatorServiceError(400, 'Could not verify this shared link. Open the video and paste its full TikTok or Instagram post URL instead.') }
  let anchorRequired = false
  if (creatorPostPlatform(input.postUrl) === 'tiktok') {
    const handle = publishingTikTokHandle(postLink.url)
    const accounts = await db.query.creatorSocialAccounts.findMany({ where: and(eq(schema.creatorSocialAccounts.creatorProfileId, profile.id), eq(schema.creatorSocialAccounts.platform, 'tiktok')) })
    const publishingAccount = accounts.find(account => account.handle?.toLowerCase() === handle)
    if (socialAccount && socialAccount.id !== publishingAccount?.id) throw new CreatorServiceError(400, 'Choose the TikTok account that published this post')
    socialAccount = publishingAccount || null
    if (!socialAccount) throw new CreatorServiceError(400, 'Connect the TikTok account that published this post')
    if (TIKTOK_ANCHOR_REQUIREMENTS_ENABLED) {
      const eligibility = tiktokAnchorEligible({ ...socialAccount, followers: accountFollowers(socialAccount) })
      if (eligibility === null) throw new CreatorServiceError(400, 'Confirm this TikTok account’s follower range in Accounts before submitting')
      anchorRequired = eligibility
      if (anchorRequired && !socialAccount.tiktokAnchorJoinedAt) throw new CreatorServiceError(400, 'Join the Mogging TikTok One project and confirm joining in Accounts before your next submission')
      if (anchorRequired && input.tiktokAnchorLinked !== true) throw new CreatorServiceError(400, 'Confirm you accepted Mogging’s TikTok One project and linked this post with its anchor')
    }
  }
  const postKey = postLink.key
  const submissionTerms = anchorRequired ? { ...sprint.terms, formats: sprint.terms.formats.map(item => item.id === format.id ? { ...item, requirements: [...item.requirements.filter(rule => rule !== TIKTOK_ANCHOR_REQUIREMENT), TIKTOK_ANCHOR_REQUIREMENT] } : item) } : sprint.terms
  await verifySubmissionAnalytics(userId, input)
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${postKey}, 0))`)
    const previousPost = await tx.query.creatorSubmissions.findFirst({ where: or(eq(schema.creatorSubmissions.postKey, postKey), eq(schema.creatorSubmissions.postUrl, input.postUrl)) })
    if (previousPost && previousPost.id !== input.registeredPostId) throw new CreatorServiceError(409, 'This video has already been submitted. Request a rereview on the original submission instead.')
    const [currentSprint] = await tx.select().from(schema.creatorSprints).where(eq(schema.creatorSprints.id, sprint.id)).for('update')
    if (!currentSprint || currentSprint.updatedAt.getTime() !== sprint.updatedAt.getTime() || sprintPhase({ ...currentSprint, startsAt: currentSprint.startsAt.toISOString(), endsAt: currentSprint.endsAt.toISOString() }) !== 'active') throw new CreatorServiceError(409, 'Campaign changed. Refresh its terms before submitting')
    const [used] = await tx.select({ cents: sql<number>`coalesce(sum(${schema.creatorSubmissions.approvedAmountCents}),0)::float8` }).from(schema.creatorSubmissions).where(eq(schema.creatorSubmissions.sprintId, sprint.id))
    if (used.cents >= currentSprint.budgetCents) throw new CreatorServiceError(409, 'This campaign’s budget is fully committed')
    const draft = input.registeredPostId ? await tx.query.creatorSubmissions.findFirst({ where: and(eq(schema.creatorSubmissions.id, input.registeredPostId), eq(schema.creatorSubmissions.creatorProfileId, profile.id)) }) : null
    if (input.registeredPostId && (!draft?.isDraft || draft.sprintId !== sprint.id || draft.formatId !== format.id || draft.socialAccountId !== socialAccount?.id)) throw new CreatorServiceError(409, 'Choose the registered post matching this campaign, format and account')
    if (draft) {
      const code = await tx.query.creatorTrackingLinkAliases.findFirst({ where: eq(schema.creatorTrackingLinkAliases.submissionId, draft.id) })
      if (!input.postedAt && !draft.postedAt) throw new CreatorServiceError(400, 'Add this post’s publication time')
      if (!code || !captionContainsCreatorCode(input.caption || draft.caption || '', code.slug)) throw new CreatorServiceError(400, 'Include the prepared post’s exact creator code in its published caption')
    }
    const values = {
      creatorProfileId: profile.id,
      socialAccountId: socialAccount?.id || null,
      sprintId: sprint.id,
      sprintTerms: draft?.sprintTerms || submissionTerms,
      formatId: format.id,
      requirementsConfirmedAt: new Date(),
      title: format.name,
      platform: creatorPostPlatform(input.postUrl) === 'tiktok' ? 'TikTok' : 'Instagram Reels',
      caption: input.caption || draft?.caption || null,
      postedAt: input.postedAt ? new Date(input.postedAt) : draft?.postedAt || null,
      isDraft: false,
      postUrl: input.postUrl,
      postKey,
      videoUrl: null,
      videoStorageKey: null,
      videoContentType: null,
      videoSizeBytes: null,
      // Retain the existing evidence column so historical screenshots stay viewable.
      analyticsScreenshotUrl: creatorAssetPublicUrl(input.analyticsStorageKey),
      analyticsStorageKey: input.analyticsStorageKey,
      analyticsContentType: input.analyticsContentType,
      analyticsSizeBytes: input.analyticsSizeBytes,
      viewCountThreshold: input.viewCountThreshold,
      usAudiencePercent: input.usAudiencePercent ?? null,
    }
    const [submission] = draft
      ? await tx.update(schema.creatorSubmissions).set(values).where(and(eq(schema.creatorSubmissions.id, draft.id), eq(schema.creatorSubmissions.isDraft, true))).returning()
      : await tx.insert(schema.creatorSubmissions).values(values).returning()
    if (!submission) throw new CreatorServiceError(409, 'This post was already submitted')
    await recordSubmissionUpdate(tx, submission.id, 'submitted')

    return submission
  }).catch(rethrowCreatorPostConflict)
}

async function verifySubmissionAnalytics(userId: string, input: CreatorSubmissionAnalyticsInput) {
  const prefix = `creators/${userId}/submission-analytics/`
  if (!input.analyticsStorageKey.startsWith(prefix) || !/^[0-9a-f-]{36}\.(mp4|mov|webm)$/.test(input.analyticsStorageKey.slice(prefix.length))) {
    throw new CreatorServiceError(400, 'Invalid analytics recording upload')
  }
  try {
    await verifyCreatorRecordingUpload(input.analyticsStorageKey, input.analyticsSizeBytes, input.analyticsContentType)
  } catch {
    throw new CreatorServiceError(400, 'Upload the complete physical analytics recording before submitting this video')
  }
}

export async function requestSubmissionReview(userId: string, submissionId: string, input: CreatorSubmissionAnalyticsInput) {
  input = creatorSubmissionAnalyticsSchema.parse(input)
  const profile = await getCreatorProfile(userId)
  if (!profile || profile.authStatus === 'suspended') throw new CreatorServiceError(403, 'Creator access required')
  const existing = await getSubmissionForCreator(userId, submissionId)
  if (!existing) throw new CreatorServiceError(404, 'Submission not found')
  await verifySubmissionAnalytics(userId, input)
  return db.transaction(async tx => {
    const [submission] = await tx.select().from(schema.creatorSubmissions).where(and(eq(schema.creatorSubmissions.id, submissionId), eq(schema.creatorSubmissions.creatorProfileId, profile.id))).for('update')
    if (submission?.isDraft) throw new CreatorServiceError(409, 'Submit this registered post with its campaign and analytics first')
    if (!submission?.sprintId || !submission.sprintTerms) throw new CreatorServiceError(409, 'Only campaign submissions can request rereview')
    if (submission.reviewRequestedAt || (['pending', 'in_review'].includes(submission.status) && submission.analyticsScreenshotUrl)) throw new CreatorServiceError(409, 'This submission is already awaiting review')
    if (submission.analyticsStorageKey === input.analyticsStorageKey) throw new CreatorServiceError(400, 'Upload a fresh analytics recording')
    const payments = await tx.query.creatorPayments.findMany({ where: eq(schema.creatorPayments.submissionId, submission.id) })
    if (payments.some(payment => ['pending', 'processing'].includes(payment.status))) throw new CreatorServiceError(409, 'Wait until the scheduled payment is completed before requesting rereview')
    const now = new Date()
    await tx.insert(schema.creatorSubmissionMessages).values({ submissionId, authorUserId: userId, authorRole: 'creator', body: `Submitted fresh analytics for review: ${input.viewCountThreshold.toLocaleString('en-US')} views · ${input.usAudiencePercent}% Tier 1 audience.${submission.analyticsScreenshotUrl ? ` Previous evidence: ${submission.analyticsScreenshotUrl} (${submission.viewCountThreshold ?? 'unrecorded'} views).` : ''}` })
    const [record] = await tx.update(schema.creatorSubmissions).set({ analyticsScreenshotUrl: creatorAssetPublicUrl(input.analyticsStorageKey), analyticsStorageKey: input.analyticsStorageKey, analyticsContentType: input.analyticsContentType, analyticsSizeBytes: input.analyticsSizeBytes, viewCountThreshold: input.viewCountThreshold, usAudiencePercent: input.usAudiencePercent, status: 'in_review', reviewRequestedAt: now, updatedAt: now }).where(eq(schema.creatorSubmissions.id, submission.id)).returning()
    await recordSubmissionUpdate(tx, submissionId, 'rereview_requested', null, now)
    return record
  }).catch(rethrowCreatorPostConflict)
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
