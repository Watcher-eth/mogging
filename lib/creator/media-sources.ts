import type { MediaAsset } from './media-asset'

type Fetch = typeof globalThis.fetch
const plain = (value = '') => value.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim()

export async function searchMedia(query: string, provider: 'commons' | 'pexels', options: { fetch?: Fetch; pexelsKey?: string; signal?: AbortSignal } = {}): Promise<Array<Extract<MediaAsset, { kind: 'image' | 'video' }>>> {
  const term = query.trim()
  if (!term || term.length > 200) throw new Error('Use a source query between 1 and 200 characters')
  const request = options.fetch ?? fetch
  if (provider === 'commons') {
    const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: term, gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '640' })
    const response = await request('https://commons.wikimedia.org/w/api.php?' + params, { signal: options.signal, headers: { 'User-Agent': 'MoggingStudio/1.0 (media source research; mogging.com)' } })
    if (!response.ok) throw new Error(`Commons source search failed (${response.status})`)
    const payload = await response.json()
    if (payload.error) throw new Error('Commons could not complete the source search')
    return Object.values(payload.query?.pages ?? {}).flatMap((page: any) => {
      const file = page.imageinfo?.[0], meta = file?.extmetadata
      if (!file?.url || !/\.(jpe?g|png|webp)$/i.test(new URL(file.url).pathname) || !file.width || !file.height) return []
      return [{ id: `commons-${page.pageid}`, kind: 'image' as const, url: file.url, width: file.width, height: file.height, role: 'context' as const,
        source: { provider: 'commons', url: file.descriptionurl, author: plain(meta?.Artist?.value), license: plain(meta?.LicenseShortName?.value) || 'Review required', ...(meta?.LicenseUrl?.value ? { licenseUrl: meta.LicenseUrl.value } : {}), usage: 'review' as const }, scope: { kind: 'public' as const } }]
    })
  }
  if (!options.pexelsKey) throw new Error('Pexels source search needs a configured PEXELS_API_KEY')
  const response = await request('https://api.pexels.com/v1/videos/search?' + new URLSearchParams({ query: term, per_page: '12', orientation: 'portrait', size: 'large' }), { headers: { Authorization: options.pexelsKey }, signal: options.signal })
  if (!response.ok) throw new Error(`Pexels source search failed (${response.status})`)
  const payload = await response.json()
  return (payload.videos ?? []).flatMap((video: any) => {
    const file = video.video_files?.filter((file: any) => file.file_type === 'video/mp4' && file.width && file.height).sort((a: any, b: any) => b.width * b.height - a.width * a.height)[0]
    if (!file) return []
    return [{ id: `pexels-${video.id}`, kind: 'video' as const, url: file.link, width: file.width, height: file.height, durationMs: video.duration * 1000, role: 'context' as const,
      source: { provider: 'pexels', url: video.url, author: video.user?.name ?? '', license: 'Pexels License', licenseUrl: 'https://www.pexels.com/license/', usage: 'review' as const }, scope: { kind: 'public' as const } }]
  })
}
