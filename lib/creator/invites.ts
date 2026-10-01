import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { creatorInviteSchema, creatorInviteTokenSchema, type CreatorInviteInput, type CreatorInvitePreview } from './invite-validation'
import { resolveTikTokAvatar } from './invite-avatar'

const invites = schema.creatorOnboardingInvites
const tokenHash = (token: string) => createHash('sha256').update(creatorInviteTokenSchema.parse(token)).digest('hex')

export async function createCreatorInvite(input: CreatorInviteInput, adminEmail: string) {
  input = creatorInviteSchema.parse(input)
  const token = randomBytes(32).toString('hex')
  const avatarUrl = input.avatarUrl || await resolveTikTokAvatar(input.handle)
  const invite = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`creator-invite:${input.handle}`}))`)
    const connected = await tx.query.creatorSocialAccounts.findFirst({ where: and(eq(schema.creatorSocialAccounts.platform, 'tiktok'), eq(schema.creatorSocialAccounts.handle, input.handle)) })
    if (connected) throw new ApiError(409, 'This TikTok account is already connected. Review it in the creator directory.')
    const pending = await tx.query.creatorOnboardingInvites.findFirst({ where: and(eq(invites.handle, input.handle), isNull(invites.claimedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())) })
    if (pending) throw new ApiError(409, 'An active invite already exists for this account. Revoke it before creating a replacement.')
    const [record] = await tx.insert(invites).values({
      tokenHash: tokenHash(token), displayName: input.displayName, handle: input.handle,
      profileUrl: input.profileUrl, avatarUrl, evidenceUrl: input.evidenceUrl,
      verifiedBy: adminEmail, expiresAt: new Date(Date.now() + 30 * 86400_000),
    }).returning()
    return record
  })
  return { id: invite.id, path: `/creator/invite/${token}`, avatarFound: Boolean(avatarUrl), expiresAt: invite.expiresAt }
}

export async function getCreatorInvitePreview(token: string): Promise<CreatorInvitePreview | null> {
  if (!creatorInviteTokenSchema.safeParse(token).success) return null
  const invite = await db.query.creatorOnboardingInvites.findFirst({ where: eq(invites.tokenHash, tokenHash(token)) })
  if (!invite) return null
  const state = invite.revokedAt || invite.expiresAt <= new Date() ? 'unavailable' : invite.claimedAt ? 'claimed' : 'ready'
  // Only public profile information reaches the invite page and social crawlers.
  return { displayName: invite.displayName, handle: invite.handle, avatarUrl: invite.avatarUrl, state }
}

export async function claimCreatorInvite(token: string, userId: string) {
  const hash = tokenHash(token)
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(invites).where(eq(invites.tokenHash, hash)).for('update')
    if (!invite) throw new ApiError(404, 'Invite not found')
    if (invite.claimedByUserId) {
      if (invite.claimedByUserId !== userId) throw new ApiError(409, 'This invite has already been claimed')
      return { destination: '/creator/setup?step=payout' }
    }
    if (invite.revokedAt || invite.expiresAt <= new Date()) throw new ApiError(410, 'This invite is no longer available. Ask us on Discord for a new link.')
    // Serialize claims for the same user, including claims of different invites.
    await tx.execute(sql`select id from users where id = ${userId} for update`)
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`creator-invite:${invite.handle}`}))`)
    let profile = await tx.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.userId, userId) })
    if (profile?.authStatus === 'suspended') throw new ApiError(403, 'This creator account is suspended')
    if (!profile) {
      const [created] = await tx.insert(schema.creatorProfiles).values({ userId, displayName: invite.displayName, socialHandle: invite.handle, authStatus: 'verified' }).onConflictDoNothing({ target: schema.creatorProfiles.userId }).returning()
      profile = created
      if (!profile) profile = await tx.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.userId, userId) })
    }
    if (!profile || profile.authStatus === 'suspended') throw new ApiError(409, 'Could not prepare creator profile')
    const [lockedProfile] = await tx.select().from(schema.creatorProfiles).where(eq(schema.creatorProfiles.id, profile.id)).for('update')
    if (!lockedProfile || lockedProfile.authStatus === 'suspended') throw new ApiError(403, 'This creator account is suspended')
    const existing = await tx.query.creatorSocialAccounts.findFirst({ where: and(eq(schema.creatorSocialAccounts.platform, 'tiktok'), eq(schema.creatorSocialAccounts.handle, invite.handle)) })
    if (existing && existing.creatorProfileId !== profile.id) throw new ApiError(409, 'This TikTok account is already connected to another creator')
    const accounts = await tx.query.creatorSocialAccounts.findMany({ where: eq(schema.creatorSocialAccounts.creatorProfileId, profile.id) })
    if (!existing && (accounts.length >= 10 || accounts.filter((account) => account.platform === 'tiktok').length >= 5)) throw new ApiError(409, 'You can connect up to 5 TikTok accounts')
    const now = new Date()
    const values = {
      displayName: invite.displayName, profileUrl: invite.profileUrl, avatarUrl: invite.avatarUrl,
      analyticsVideoUrl: invite.evidenceUrl, analyticsPeriodDays: 28, analyticsConfirmedAt: invite.verifiedAt,
      status: 'approved' as const, reviewNote: 'Account ownership and audience analytics verified with our team on Discord.', updatedAt: now,
    }
    if (existing) await tx.update(schema.creatorSocialAccounts).set(values).where(eq(schema.creatorSocialAccounts.id, existing.id))
    else await tx.insert(schema.creatorSocialAccounts).values({ ...values, creatorProfileId: profile.id, platform: 'tiktok', handle: invite.handle, connectionMethod: 'manual' })
    await tx.update(schema.creatorProfiles).set({ authStatus: 'verified', updatedAt: now }).where(eq(schema.creatorProfiles.id, profile.id))
    await tx.update(invites).set({ claimedByUserId: userId, claimedAt: now }).where(eq(invites.id, invite.id))
    return { destination: '/creator/setup?step=payout' }
  })
}

export async function listCreatorInvites() {
  return db.select({ id: invites.id, displayName: invites.displayName, handle: invites.handle, expiresAt: invites.expiresAt, claimedAt: invites.claimedAt, revokedAt: invites.revokedAt }).from(invites).orderBy(sql`${invites.createdAt} desc`).limit(100)
}

export async function revokeCreatorInvite(id: string) {
  const [invite] = await db.update(invites).set({ revokedAt: new Date() }).where(and(eq(invites.id, id), isNull(invites.claimedAt))).returning({ id: invites.id })
  if (!invite) throw new ApiError(409, 'Invite not found or already claimed')
  return invite
}
