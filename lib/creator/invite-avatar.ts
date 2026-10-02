import { isCreatorAvatarUrl } from './invite-validation'
import { env } from '@/lib/env'
import { creatorAssetPublicUrl, storeCreatorAsset } from '@/lib/storage/videos'

// Fetch only the canonical TikTok profile and known image CDNs; never follow redirects.
export async function resolveTikTokAvatar(handle: string): Promise<string | null> {
  if (!/^[a-z0-9._]{1,32}$/.test(handle)) return null
  try {
    const response = await fetch(`https://www.tiktok.com/@${handle}`, { redirect: 'error', signal: AbortSignal.timeout(4000) })
    if (!response.ok) return null
    const html = await readLimited(response, 2 * 1024 * 1024)
    const payload = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    if (!payload) return null
    const user = JSON.parse(payload)?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo?.user
    if (user?.uniqueId?.toLowerCase() !== handle) return null
    const avatar = user.avatarLarger || user.avatarMedium || user.avatarThumb
    return typeof avatar === 'string' && isCreatorAvatarUrl(avatar) ? avatar : null
  } catch { return null }
}

export async function creatorAvatarDataUrl(url: string | null) {
  const storedAvatarBase = env.R2_PUBLIC_BASE_URL ? `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, '')}/creator/avatars/` : null
  if (!url) return null
  let instagramPhoto = false
  try {
    const parsed = new URL(url)
    instagramPhoto = parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port &&
      ['cdninstagram.com', 'fbcdn.net'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))
  } catch { return null }
  if (!isCreatorAvatarUrl(url) && !instagramPhoto && !(storedAvatarBase && url.startsWith(storedAvatarBase))) return null
  try {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(4000) })
    const type = response.headers.get('content-type')?.split(';')[0]
    if (!response.ok || !type || !['image/png', 'image/jpeg', 'image/webp'].includes(type)) return null
    const data = await readLimited(response, 2 * 1024 * 1024, true)
    return `data:${type};base64,${Buffer.from(data).toString('base64')}`
  } catch { return null }
}

export async function preserveCreatorAvatar(url: string) {
  if (!env.R2_PUBLIC_BASE_URL) return url
  const dataUrl = await creatorAvatarDataUrl(url)
  if (!dataUrl) return url
  const [header, data] = dataUrl.split(',')
  const contentType = header.slice(5).split(';')[0]
  const extension = contentType === 'image/jpeg' ? 'jpeg' : contentType.split('/')[1]
  const key = `creator/avatars/${crypto.randomUUID()}.${extension}`
  await storeCreatorAsset(key, Buffer.from(data, 'base64'), contentType)
  return creatorAssetPublicUrl(key)
}

async function readLimited(response: Response, limit: number, binary?: false): Promise<string>
async function readLimited(response: Response, limit: number, binary: true): Promise<Uint8Array>
async function readLimited(response: Response, limit: number, binary = false): Promise<string | Uint8Array> {
  if (!response.body) throw new Error('Empty response')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Response too large')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const data = Buffer.concat(chunks)
  return binary ? data : data.toString('utf8')
}
