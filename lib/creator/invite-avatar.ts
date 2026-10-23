import { isCreatorAvatarUrl } from './invite-validation'
import { env } from '@/lib/env'
import { creatorAssetPublicUrl, storeCreatorAsset } from '@/lib/storage/videos'

type Platform = 'tiktok' | 'instagram'

function profileImage(value: unknown, platform: Platform): string | null {
  if (typeof value !== 'string') return null
  if (platform === 'tiktok') return isCreatorAvatarUrl(value) ? value : null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['cdninstagram.com', 'fbcdn.net'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? url.href : null
  } catch { return null }
}

// Only a provider object with the exact requested username can supply a photo.
export function parseCreatorAvatar(payload: unknown, platform: Platform, handle: string): string | null {
  const nodes: unknown[] = [payload]
  for (let visited = 0; nodes.length && visited < 20_000; visited++) {
    const node = nodes.pop()
    if (!node || typeof node !== 'object') continue
    const user = node as Record<string, unknown>
    const username = platform === 'tiktok' ? user.uniqueId : user.username
    if (typeof username === 'string' && username.toLowerCase() === handle.toLowerCase()) {
      const image = platform === 'tiktok' ? user.avatarLarger || user.avatarMedium || user.avatarThumb : user.profile_pic_url_hd || user.profile_pic_url
      const url = profileImage(image, platform)
      if (url) return url
    }
    nodes.push(...Object.values(node))
  }
  return null
}

export async function resolveCreatorAvatar(platform: Platform, handle: string): Promise<string | null> {
  if (!/^[a-z0-9._]{1,40}$/i.test(handle)) return null
  const endpoint = platform === 'tiktok' ? `https://www.tiktok.com/@${handle}` : `https://www.instagram.com/${handle}/`
  try {
    const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(4000), cache: 'no-store' })
    if (!response.ok) return null
    const html = await readLimited(response, 2 * 1024 * 1024)
    for (const match of html.matchAll(/<script[^>]*(?:type="application\/(?:ld\+)?json"|id="__UNIVERSAL_DATA_FOR_REHYDRATION__")[^>]*>([\s\S]*?)<\/script>/g)) {
      try {
        const image = parseCreatorAvatar(JSON.parse(match[1]), platform, handle)
        if (image) return image
      } catch { /* Login/challenge pages and changed markup are not profile proof. */ }
    }
    return null
  } catch { return null }
}

export function resolveTikTokAvatar(handle: string) {
  return resolveCreatorAvatar('tiktok', handle)
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
  try {
    await storeCreatorAsset(key, Buffer.from(data, 'base64'), contentType)
    return creatorAssetPublicUrl(key)
  } catch { return url }
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
