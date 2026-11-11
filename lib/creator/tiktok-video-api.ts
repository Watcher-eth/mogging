import { z } from 'zod'

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

export const hasVideoScope = (scope: string | null | undefined) => (scope || '').split(/[ ,]+/).includes('video.list')
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const video = z.object({ id: z.string().regex(/^\d+$/), create_time: count, view_count: count,
  like_count: count.optional(), comment_count: count.optional(), share_count: count.optional() })
export type TikTokVideo = z.infer<typeof video>

export class TikTokVideoError extends Error {
  constructor(public readonly reason: 'reconnect_required' | 'rate_limited' | 'provider_unavailable') { super(reason) }
}

export async function queryTikTokVideos(token: string, ids: string[], fetcher: Fetcher = fetch): Promise<TikTokVideo[]> {
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  if (unique.length > 20 || unique.some(id => !/^\d+$/.test(id))) throw new Error('Query requires at most 20 canonical TikTok IDs')
  const response = await fetcher('https://open.tiktokapis.com/v2/video/query/?fields=id,create_time,view_count,like_count,comment_count,share_count', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: { video_ids: unique } }), signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 429) throw new TikTokVideoError('rate_limited')
  const data = await response.json() as { error?: { code?: string }; data?: { videos?: unknown[] } }
  if (response.status === 401 || ['access_token_invalid','scope_not_authorized'].includes(data.error?.code || '')) throw new TikTokVideoError('reconnect_required')
  if (!response.ok || data.error?.code !== 'ok' || !Array.isArray(data.data?.videos)) throw new TikTokVideoError('provider_unavailable')
  // Missing/private videos and omitted counts remain absent, never fabricated zeros.
  const requested = new Set(unique)
  return data.data.videos.flatMap(item => {
    const result = video.safeParse(item)
    return result.success && requested.delete(result.data.id) ? [result.data] : []
  })
}

export async function refreshTikTokVideoToken(clientKey: string, clientSecret: string, refreshToken: string) {
  const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10_000),
    body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
  })
  const token = z.object({ access_token: z.string().min(1), refresh_token: z.string().min(1), open_id: z.string().min(1),
    expires_in: z.number().int().positive(), scope: z.string() }).safeParse(await response.json())
  if (!response.ok || !token.success) throw new TikTokVideoError(response.status === 429 ? 'rate_limited' : response.status >= 500 ? 'provider_unavailable' : 'reconnect_required')
  return token.data
}
