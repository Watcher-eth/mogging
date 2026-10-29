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
  '/', '/faq', '/what-is-mogging', '/how-face-analysis-works',
  '/analysis', '/leaderboard', '/privacy', '/support', '/tos',
] as const

export function canonicalUrl(path: string) {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/'
  const preferredPath = ({ '/app': '/', '/de-AT': '/de', '/de-CH': '/de', '/es-419': '/es' } as Record<string, string>)[pathname] ?? pathname
  return `${siteUrl}${preferredPath}`
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

// Change these dates only after a significant content update, not on every request.
export const pageLastModified: Record<string, string> = {
  '/': '2026-10-28',
  '/de': '2026-10-28',
  '/es': '2026-10-28',
  '/fr': '2026-10-28',
  '/zh-Hans': '2026-10-28',
  '/what-is-mogging': '2026-10-28',
  '/how-face-analysis-works': '2026-10-28',
}

export const mobileApplicationSchema = {
  '@context': 'https://schema.org',
  '@type': 'MobileApplication',
  '@id': `${siteUrl}/#ios-app`,
  name: 'Mogging',
  url: `${siteUrl}/`,
  operatingSystem: 'iOS',
  applicationCategory: 'LifestyleApplication',
  installUrl: appStoreUrl,
  publisher: { '@id': `${siteUrl}/#organization` },
}
