// Match the production host redirect. Preview URLs must never become canonicals.
export const siteUrl = 'https://www.mogging.com'
export const appStoreUrl = 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050'

export function socialImageForPath(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return pathname === '/leaderboard'
    ? { path: '/leaderboard.png', width: 1200, height: 630 }
    : { path: '/Og1.png', width: 862, height: 644 }
}

export const publicPaths = [
  '/', '/what-is-mogging', '/how-face-analysis-works',
  '/analysis', '/battle', '/leaderboard', '/privacy', '/support', '/tos',
] as const

export function canonicalUrl(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return `${siteUrl}${pathname === '/app' ? '/' : pathname}`
}

export function robotsForPath(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  return (publicPaths as readonly string[]).includes(pathname) || pathname === '/app'
    ? 'index, follow, max-image-preview:large'
    : 'noindex, follow'
}

export function serializeJsonLd(data: Record<string, unknown>) {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
