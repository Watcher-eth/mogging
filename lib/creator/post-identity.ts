import { ApiError } from '@/lib/api/http'
import { creatorPostPlatform } from './validation'

// IDs survive tracking parameters, username changes and alternate platform URL shapes.
export function creatorPostIdentity(value: string): string | null {
  const platform = creatorPostPlatform(value)
  if (!platform) return null
  const path = new URL(value).pathname
  const id = platform === 'tiktok'
    ? path.match(/^\/@[\w.]+\/(?:video|photo)\/(\d+)\/?$/)?.[1]
    : !path.startsWith('/share/') && path.match(/\/(?:reel|reels|p)\/([a-zA-Z0-9_-]+)\/?$/)?.[1]
  return id ? `${platform}:${id}` : null
}

export async function resolveCreatorPostIdentity(value: string): Promise<string> {
  let url = new URL(value)
  const platform = creatorPostPlatform(value)
  if (!platform) throw new Error('Enter a published TikTok or Instagram post link')
  const signal = AbortSignal.timeout(8_000)
  for (let redirect = 0; redirect < 6; redirect++) {
    const identity = creatorPostIdentity(url.href)
    if (identity?.startsWith(`${platform}:`)) return identity
    // Validate every hop before making a request; never follow arbitrary redirect hosts.
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !(
      platform === 'tiktok'
        ? ['www.tiktok.com', 'tiktok.com', 'm.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'].includes(url.hostname)
        : ['www.instagram.com', 'instagram.com'].includes(url.hostname)
    )) break
    const response = await fetch(url, { redirect: 'manual', signal })
    await response.body?.cancel()
    const location = response.headers.get('location')
    if (response.status < 300 || response.status >= 400 || !location) break
    url = new URL(location, url)
  }
  throw new Error('Could not verify this shared link. Open the video and paste its full TikTok or Instagram post URL instead.')
}

// Drizzle wraps PostgreSQL errors in a cause; only translate this exact constraint.
export function rethrowCreatorPostConflict(error: unknown): never {
  let cause = error
  for (let depth = 0; cause && typeof cause === 'object' && depth < 5; depth++) {
    if ('code' in cause && cause.code === '23505' && 'constraint_name' in cause && cause.constraint_name === 'creator_submissions_post_key_unique') {
      throw new ApiError(409, 'This video already has a submission. Request a rereview on the original submission instead.')
    }
    cause = 'cause' in cause ? cause.cause : null
  }
  throw error
}
