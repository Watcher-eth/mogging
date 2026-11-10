import type { ParsedUrlQuery } from 'node:querystring'

export function phonePwaEntryPath(query: ParsedUrlQuery) {
  if (query.checkout === 'success' && typeof query.session_id === 'string') {
    return `/app/handoff?session_id=${encodeURIComponent(query.session_id)}`
  }
  if (query.login === '1') {
    const params = new URLSearchParams({ login: '1' })
    if (typeof query.next === 'string') params.set('next', query.next)
    return `/analysis?${params}`
  }
  if (query.start === '1') {
    const params = new URLSearchParams({ start: '1' })
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const value = query[key]
      if (typeof value === 'string') params.set(key, value)
    }
    return `/analysis?${params}`
  }
  return '/analysis'
}

export function homepageDestinationCookie(destination: 'web' | 'store', secure: boolean) {
  return `mogging.homepage.destination=${destination === 'web' ? 'web' : ''}; Path=/; SameSite=Lax; Max-Age=${destination === 'web' ? 7776000 : 0}${secure ? '; Secure' : ''}`
}
