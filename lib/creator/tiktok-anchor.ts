import { z } from 'zod'

export const TIKTOK_ANCHOR_INVITE =
  'https://www.tiktok.com/t/ZS9UgQb9Cp1Eq-WbUok/#linkSource=DirectLink'
export const TIKTOK_ANCHOR_REQUIREMENT =
  'For this TikTok account with 1,000+ followers: accept the Mogging TikTok One project before posting, then use Content disclosure → Disclose post content → Branded content → Link project to link this video to Mogging with its anchor.'
export const FOLLOWER_RANGES = [
  { value: 'under_1k', label: 'Under 1,000' },
  { value: '1k_5k', label: '1,000–4,999' },
  { value: '5k_10k', label: '5,000–9,999' },
  { value: '10k_plus', label: '10,000+' },
] as const
export const followerRangeSchema = z.enum(FOLLOWER_RANGES.map(range => range.value))
export type FollowerRange = z.infer<typeof followerRangeSchema>
export type CreatorFollowers = (
  | { source: 'public' | 'oauth'; count: number }
  | { source: 'manual'; count: number; minimum?: true }
  | { source: 'self_reported'; range: FollowerRange }
) & { checkedAt: string }

export function followersFromOAuth(
  profile: Record<string, unknown> | null | undefined,
  checkedAt = new Date().toISOString()
): CreatorFollowers | null {
  const count = profile?.follower_count
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
    ? { source: 'oauth', count, checkedAt }
    : null
}

export function tiktokAnchorEligible(
  account:
    | { platform: string; followers?: CreatorFollowers | null }
    | null
    | undefined
): boolean | null {
  if (!account || account.platform !== 'tiktok') return false
  const followers = account.followers
  if (!followers) return null
  return followers.source === 'self_reported'
    ? followers.range !== 'under_1k'
    : followers.count >= 1000
}

export function accountFollowers(account: {
  followers?: CreatorFollowers | null
  oauthProfile?: Record<string, unknown> | null
  oauthVerifiedAt?: Date | string | null
}) {
  return (
    account.followers ||
    followersFromOAuth(
      account.oauthProfile,
      account.oauthVerifiedAt
        ? new Date(account.oauthVerifiedAt).toISOString()
        : undefined
    )
  )
}

export function followerLabel(followers?: CreatorFollowers | null) {
  if (!followers) return 'Follower count needed'
  if (followers.source === 'manual')
    return `${followers.count.toLocaleString('en-US')}${followers.minimum ? '+' : ''} followers · manually confirmed`
  return followers.source === 'self_reported'
    ? `${FOLLOWER_RANGES.find((item) => item.value === followers.range)?.label} followers · self-reported`
    : `${followers.count.toLocaleString('en-US')} followers · TikTok`
}

export function publishingTikTokHandle(url: string) {
  try {
    return (
      new URL(url).pathname
        .match(/^\/@([\w.]+)\/(?:video|photo)\//)?.[1]
        .toLowerCase() || null
    )
  } catch {
    return null
  }
}
