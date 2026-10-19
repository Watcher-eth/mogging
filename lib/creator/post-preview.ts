import { creatorPostIdentity } from './post-identity'

export type CreatorPostPreview = {
  thumbnailUrl: string | null
  caption: string | null
  authorName: string | null
  width: number | null
  height: number | null
  viewCount: number | null
  fetchedAt: string | null
}

export const emptyPostPreview: CreatorPostPreview = {
  thumbnailUrl: null, caption: null, authorName: null,
  width: null, height: null, viewCount: null, fetchedAt: null,
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, 2000) : null
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function thumbnail(value: unknown, platform: string): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const domains = platform === 'tiktok'
      ? ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'muscdn.com', 'ibytedtos.com']
      : ['cdninstagram.com', 'fbcdn.net']
    return url.protocol === 'https:' && !url.username && !url.password && !url.port && domains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url.href : null
  } catch { return null }
}

function scriptJson(html: string, id: string) {
  const raw = html.match(new RegExp(`<script[^>]*id="${id}"[^>]*>([\\s\\S]*?)</script>`))?.[1]
  return raw ? JSON.parse(raw) : null
}

// Parse provider JSON as data, never executable scripts or rendered HTML.
export function parsePublicPostPreview(html: string, platform: string, id: string): CreatorPostPreview {
  try {
    if (platform === 'tiktok') {
      const embed = scriptJson(html, '__FRONTITY_CONNECT_STATE__')?.source?.data?.[`/embed/v2/${id}`]?.videoData
      const post = scriptJson(html, '__UNIVERSAL_DATA_FOR_REHYDRATION__')?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct
      const item = embed?.itemInfos
      if (item?.id === id || post?.id === id) {
        const video = item?.id === id ? item.video?.videoMeta : post.video
        return {
          thumbnailUrl: thumbnail(item?.id === id ? item.coversOrigin?.[0] || item.covers?.[0] : post.video?.originCover || post.video?.cover, platform),
          caption: text(item?.id === id ? item.text : post.desc),
          authorName: text(item?.id === id ? embed.authorInfos?.uniqueId : post.author?.uniqueId),
          width: count(video?.width), height: count(video?.height),
          viewCount: count(item?.id === id ? item.playCount : post.stats?.playCount),
          fetchedAt: new Date().toISOString(),
        }
      }
    } else {
      const encoded = html.match(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/)?.[1]
      const context = encoded ? JSON.parse(JSON.parse(encoded)) : null
      const post = context?.gql_data?.shortcode_media
      if (post && (post.shortcode ? post.shortcode === id : context.context?.shortcode === id)) {
        return {
          thumbnailUrl: thumbnail(post.display_url, platform),
          caption: text(post.edge_media_to_caption?.edges?.[0]?.node?.text),
          authorName: text(post.owner?.username),
          width: count(post.dimensions?.width), height: count(post.dimensions?.height),
          viewCount: count(post.video_view_count), fetchedAt: new Date().toISOString(),
        }
      }
      const image = html.match(/<img\b[^>]*\bclass="[^"]*\bEmbeddedMediaImage\b[^"]*"[^>]*>/i)?.[0]
      return { ...emptyPostPreview, thumbnailUrl: thumbnail(image?.match(/\bsrc="([^"]+)"/i)?.[1]?.replaceAll('&amp;', '&'), platform) }
    }
  } catch { /* Provider markup can change or the post may be unavailable. */ }
  return emptyPostPreview
}

async function publicHtml(endpoint: string) {
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(3_000), redirect: 'error' })
    return response.ok ? await response.text() : ''
  } catch { return '' }
}

// Only fetch platform-owned endpoints; never follow arbitrary submitted URLs.
export async function getCreatorPostPreview(postUrl: string | null): Promise<CreatorPostPreview> {
  if (!postUrl) return emptyPostPreview
  let identity: string | null
  try { identity = creatorPostIdentity(postUrl) } catch { return emptyPostPreview }
  if (!identity) return emptyPostPreview
  const [platform, id] = identity.split(':')
  if (platform === 'instagram') {
    return parsePublicPostPreview(await publicHtml(`https://www.instagram.com/p/${id}/embed/`), platform, id)
  }
  const canonical = `https://www.tiktok.com${new URL(postUrl).pathname}`
  for (const endpoint of [`https://www.tiktok.com/embed/v2/${id}`, canonical]) {
    const preview = parsePublicPostPreview(await publicHtml(endpoint), platform, id)
    if (preview.thumbnailUrl || preview.caption || preview.viewCount !== null) return preview
  }
  try {
    const response = await fetch(`https://www.tiktok.com/oembed?${new URLSearchParams({ url: canonical })}`, { signal: AbortSignal.timeout(3_000), redirect: 'error' })
    if (!response.ok) return emptyPostPreview
    const data = await response.json()
    return {
      ...emptyPostPreview, thumbnailUrl: thumbnail(data.thumbnail_url, platform),
      caption: text(data.title), authorName: text(data.author_url?.match(/^https:\/\/(?:www\.)?tiktok\.com\/@([\w.]+)/)?.[1]),
      width: count(data.thumbnail_width), height: count(data.thumbnail_height),
      fetchedAt: new Date().toISOString(),
    }
  } catch { return emptyPostPreview }
}
