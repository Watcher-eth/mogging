import { describe, expect, test } from 'bun:test'
import { canonicalUrl, publicPaths, robotsForPath, serializeJsonLd, socialImageForPath } from './seo'

test('all routes use Og1 except the leaderboard', () => {
  for (const path of [...publicPaths.filter(path => path !== '/leaderboard'), '/creator/cta-generator', '/share/[token]', '/404', '/new-route']) {
    expect(socialImageForPath(path)).toEqual({ path: '/Og1.png', width: 862, height: 644 })
  }
  for (const path of ['/leaderboard', '/leaderboard/', '/leaderboard?period=week']) {
    expect(socialImageForPath(path).path).toBe('/leaderboard.png')
  }
})

describe('search indexing policy', () => {
  test('consolidates tracking, fragments, trailing slashes and the app alias', () => {
    expect(canonicalUrl('/?utm_source=tiktok')).toBe('https://www.mogging.com/')
    expect(canonicalUrl('/app?checkout=success')).toBe('https://www.mogging.com/')
    expect(canonicalUrl('/what-is-mogging/#origin')).toBe('https://www.mogging.com/what-is-mogging')
  })

  test('keeps all sitemap routes indexable', () => {
    for (const path of publicPaths) expect(robotsForPath(path)).toStartWith('index,')
  })

  test('excludes utility, private report, placeholder and unknown routes', () => {
    for (const path of ['/share/[token]', '/admin/creators', '/creator', '/auth/register', '/app/handoff', '/app/mobile-auth', '/ranking', '/404', '/not-a-real-page']) {
      expect(robotsForPath(path)).toBe('noindex, follow')
    }
  })

  test('JSON-LD cannot terminate its script element', () => {
    const value = { headline: '</script><script>alert(1)</script>' }
    const serialized = serializeJsonLd(value)
    expect(serialized).not.toContain('<')
    expect(JSON.parse(serialized)).toEqual(value)
  })
})
