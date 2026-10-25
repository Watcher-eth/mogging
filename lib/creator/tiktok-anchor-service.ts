import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { ApiError } from '@/lib/api/http'
import { getCreatorTikTokAccessToken } from './service'
import { getTikTokUserInfo } from '@/lib/auth/tiktok-api'
import {
  accountFollowers,
  followersFromOAuth,
  tiktokAnchorEligible,
  type FollowerRange,
} from './tiktok-anchor'
import { resolveTikTokFollowers } from './tiktok-followers'

export async function updateTikTokAnchorAccount(
  userId: string,
  id: string,
  input:
    | { action: 'followers'; range: FollowerRange }
    | { action: 'joined'; confirmed: true }
) {
  const profile = await db.query.creatorProfiles.findFirst({
    where: eq(schema.creatorProfiles.userId, userId),
  })
  if (!profile || profile.authStatus === 'suspended')
    throw new ApiError(403, 'Creator access required')
  const account = await db.query.creatorSocialAccounts.findFirst({
    where: and(
      eq(schema.creatorSocialAccounts.id, id),
      eq(schema.creatorSocialAccounts.creatorProfileId, profile.id),
      eq(schema.creatorSocialAccounts.platform, 'tiktok')
    ),
  })
  if (!account) throw new ApiError(404, 'TikTok account not found')
  if (input.action === 'joined') {
    if (
      tiktokAnchorEligible({
        ...account,
        followers: accountFollowers(account),
      }) !== true
    )
      throw new ApiError(
        400,
        'Optional app anchors are available to TikTok accounts with at least 1,000 followers'
      )
    // A creator confirmation, not a claim that TikTok membership was API-verified.
    const [updated] = await db
      .update(schema.creatorSocialAccounts)
      .set({ tiktokAnchorJoinedAt: account.tiktokAnchorJoinedAt || new Date() })
      .where(eq(schema.creatorSocialAccounts.id, account.id))
      .returning()
    return updated
  }
  const token = await getCreatorTikTokAccessToken(userId, account.id)
  const oauth = token
    ? await getTikTokUserInfo(token, ['follower_count'], AbortSignal.timeout(5000))
        .then((result) => followersFromOAuth(result.data?.user))
        .catch(() => null)
    : null
  const followers =
    oauth || (await resolveTikTokFollowers(account.handle, input.range))
  const [updated] = await db
    .update(schema.creatorSocialAccounts)
    .set({ followers })
    .where(eq(schema.creatorSocialAccounts.id, account.id))
    .returning()
  return updated
}
