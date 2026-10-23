import { and, eq, isNull, lt, or } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/api/http'
import { preserveCreatorAvatar, resolveCreatorAvatar } from './invite-avatar'

export async function fetchAccountAvatar(platform: 'tiktok' | 'instagram', handle: string | null, oauthAvatar?: string | null) {
  const source = oauthAvatar || (handle ? await resolveCreatorAvatar(platform, handle) : null)
  return source ? preserveCreatorAvatar(source) : null
}

// Attempts are claimed in the database, preventing refresh storms across tabs.
// Failed lookups retry hourly; stored photos refresh daily and stay usable.
export async function refreshCreatorAccountAvatars(userId: string) {
  const profile = await db.query.creatorProfiles.findFirst({ where: eq(schema.creatorProfiles.userId, userId) })
  if (!profile || profile.authStatus === 'suspended') throw new ApiError(403, 'Creator access required')
  const accounts = schema.creatorSocialAccounts
  const now = new Date()
  const owned = await db.query.creatorSocialAccounts.findMany({ where: eq(accounts.creatorProfileId, profile.id), limit: 10 })
  return Promise.all(owned.map(async account => {
    const stored = env.R2_PUBLIC_BASE_URL && account.avatarUrl?.startsWith(`${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/creator/avatars/`)
    const cutoff = new Date(now.getTime() - (stored ? 86400_000 : 3600_000))
    const [claimed] = await db.update(accounts).set({ avatarCheckedAt: now })
      .where(and(eq(accounts.id, account.id), eq(accounts.creatorProfileId, profile.id), or(isNull(accounts.avatarCheckedAt), lt(accounts.avatarCheckedAt, cutoff)))).returning({ id: accounts.id })
    if (!claimed) return { id: account.id, avatarUrl: account.avatarUrl }
    const oauthPhoto = !account.handle && account.platform === 'tiktok' && account.connectionMethod === 'oauth'
      ? account.oauthProfile?.avatar_large_url || account.oauthProfile?.avatar_url_100 || account.oauthProfile?.avatar_url
      : null
    const avatarUrl = await fetchAccountAvatar(account.platform, account.handle, typeof oauthPhoto === 'string' ? oauthPhoto : null)
    if (!avatarUrl) return { id: account.id, avatarUrl: account.avatarUrl }
    const [saved] = await db.update(accounts).set({ avatarUrl })
      .where(and(eq(accounts.id, account.id), eq(accounts.creatorProfileId, profile.id), account.handle ? eq(accounts.handle, account.handle) : isNull(accounts.handle)))
      .returning({ avatarUrl: accounts.avatarUrl })
    return { id: account.id, avatarUrl: saved?.avatarUrl || null }
  }))
}
