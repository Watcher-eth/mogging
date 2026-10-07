// Installed iOS apps intercept Universal Links; remaining browser requests go to the store.
export function creatorLinkPlatform(userAgent: string): 'ios' | 'android' | 'web' {
  if (/iPhone|iPad|iPod|Macintosh.*Mobile/i.test(userAgent)) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'web'
}

export function buildCreatorDeepLink(slug: string, token: string) {
  const url = new URL(`mogging://r/${encodeURIComponent(slug)}`)
  url.searchParams.set('attribution_token', token)
  return url.toString()
}

// The first-party click token remains authoritative; OneLink only carries it across installation.
export function buildCreatorInstallLink(base: string | undefined, slug: string, token: string, fallback: string) {
  if (!base) return fallback
  let url: URL
  try { url = new URL(base) } catch { return fallback }
  if (url.protocol !== 'https:' || url.hostname !== 'mogging.onelink.me' || url.pathname !== '/rnQm') return fallback
  url.searchParams.set('pid', 'creator')
  url.searchParams.set('c', slug)
  url.searchParams.set('af_channel', 'creator')
  url.searchParams.set('deep_link_value', slug)
  url.searchParams.set('deep_link_sub1', token)
  return url.toString()
}
