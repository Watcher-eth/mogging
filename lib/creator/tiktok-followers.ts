import type { CreatorFollowers, FollowerRange } from './tiktok-anchor'

export function parseTikTokFollowers(
  html: string,
  handle: string
): CreatorFollowers | null {
  try {
    const raw = html.match(
      /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
    )?.[1]
    const profile = raw
      ? JSON.parse(raw).__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
      : null
    if (profile?.user?.uniqueId?.toLowerCase() !== handle.toLowerCase())
      return null
    const value = profile.statsV2?.followerCount ?? profile.stats?.followerCount
    const count =
      typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
    return typeof count === 'number' &&
      Number.isSafeInteger(count) &&
      count >= 0
      ? { source: 'public', count, checkedAt: new Date().toISOString() }
      : null
  } catch {
    return null
  }
}

export async function fetchTikTokFollowers(
  handle: string | null
): Promise<CreatorFollowers | null> {
  if (!handle || !/^[a-z0-9._]{1,32}$/i.test(handle)) return null
  try {
    const response = await fetch(`https://www.tiktok.com/@${handle}`, {
      signal: AbortSignal.timeout(3000),
      redirect: 'error',
      cache: 'no-store',
    })
    return response.ok
      ? parseTikTokFollowers(await response.text(), handle)
      : null
  } catch {
    return null
  }
}

export async function resolveTikTokFollowers(
  handle: string | null,
  range?: FollowerRange
): Promise<CreatorFollowers | null> {
  return (
    (await fetchTikTokFollowers(handle)) ||
    (range
      ? { source: 'self_reported', range, checkedAt: new Date().toISOString() }
      : null)
  )
}
