import { creatorPostPlatform } from './validation'

export function publishedVideoEmbedUrl(value: string | null) {
  if (!value) return null
  const platform = creatorPostPlatform(value)
  if (!platform) return null
  const path = new URL(value).pathname
  if (platform === 'tiktok') {
    const id = path.match(/^\/@[\w.]+\/video\/(\d+)\/?$/)?.[1]
    return id ? `https://www.tiktok.com/player/v1/${id}` : null
  }
  if (path.startsWith('/share/')) return null
  const post = path.match(/^\/(?:[\w.]+\/)?(reel|reels|p)\/([\w-]+)\/?$/)
  return post ? `https://www.instagram.com/${post[1]}/${post[2]}/embed/` : null
}
