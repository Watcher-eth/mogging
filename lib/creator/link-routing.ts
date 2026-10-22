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
