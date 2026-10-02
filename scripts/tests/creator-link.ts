import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

let clicks = 0
let accounts = 0
let cookieToken = ''
mock.module('@/lib/fonts', () => ({ moggingFont: { className: 'test-font' } }))
mock.module('@/lib/creator/attribution', () => ({
  createCreatorAttributionClick: async ({ slug, userAgent }: { slug: string; userAgent: string }) => {
    if (slug !== 'creator-test') return null
    clicks++
    return { token: 'test-signed-token', isBot: userAgent === 'bot', click: { isBot: userAgent === 'bot' },
      deepLinkUrl: 'mogging://r/creator-test?attribution_token=test-signed-token',
      link: { slug, socialAccountId: 'account', iosAppStoreUrl: 'https://apps.apple.com/app/id6771414050?ct=creator-test&pt=provider', androidAppStoreUrl: null } }
  },
  setCreatorAttributionCookie: (_res: unknown, token: string) => { cookieToken = token },
}))
mock.module('@/lib/auth/anonymous', () => ({ getOrSetAnonymousActorId: () => 'visitor' }))
mock.module('@/lib/api/rateLimit', () => ({ enforceRateLimit: async () => {} }))
mock.module('@/lib/db', () => ({ schema: {}, db: { query: { creatorSocialAccounts: { findFirst: async () => {
  accounts++
  return { handle: 'creator', displayName: 'Creator Name', platform: 'tiktok', avatarUrl: 'https://p16.tiktokcdn.com/avatar.jpeg' }
} } } } }))
const { getServerSideProps } = await import('../../pages/r/[slug]')
const { default: handler } = await import('../../pages/api/attribution/link')
function response() {
  return { headers: {} as Record<string, unknown>, statusCode: 200, body: null as any,
    setHeader(key: string, value: unknown) { this.headers[key] = value },
    status(value: number) { this.statusCode = value; return this },
    json(value: unknown) { this.body = value; return this }, end() {} }
}
async function page(ua: string, query = {}, slug = 'creator-test') {
  const res = response()
  const result = await getServerSideProps!({ params: { slug }, query, req: { headers: { 'user-agent': ua } }, res } as any)
  assert.equal(res.headers['Cache-Control'], 'private, no-store')
  return result as any
}
const ios = (await page('iPhone Safari')).props
assert.equal(ios.storeUrl, 'https://apps.apple.com/app/id6771414050?ct=creator-test&pt=provider')
assert.equal(ios.creator, 'Creator Name')
assert.equal(ios.avatarUrl, 'https://p16.tiktokcdn.com/avatar.jpeg')
assert.equal(ios.imageUrl, 'https://www.mogging.com/api/og/creator-referral?slug=creator-test')
assert.equal(cookieToken, 'test-signed-token')
assert.match(ios.deepLinkUrl, /attribution_token=test-signed-token/)
assert.equal((await page('iPhone Instagram')).props.code, 'creator-test')
assert.equal((await page('iPhone Safari', { fallback: '1' })).props.code, 'creator-test')
assert.equal((await page('Android')).props.storeUrl, null, 'Android must never receive an iOS store fallback')
assert.equal((await page('bot')).props.code, 'creator-test')
const desktop = (await page('Macintosh Safari')).props
assert.match(desktop.webUrl, /^https:\/\/www.mogging.com\/\?utm_source=tiktok/)
assert.match(desktop.webUrl, /attribution_token=test-signed-token/)
assert.equal(desktop.storeUrl, ios.storeUrl)
assert.ok(accounts > 0)
assert.equal((await page('iPhone', {}, 'inactive')).notFound, true)
for (const [method, slug, status] of [['GET', 'creator-test', 405], ['POST', 'bad code', 400], ['POST', 'inactive', 404], ['POST', 'creator-test', 200]] as const) {
  const res = response()
  await handler({ method, headers: { 'user-agent': 'Mogging iOS' }, body: { slug } } as any, res as any)
  assert.equal(res.statusCode, status)
  if (status === 200) assert.match(res.body.data.url, /^mogging:\/\/r\/creator-test/)
}
assert.ok(clicks > 0)
console.log('Creator routing and code endpoint checks passed (mocked database; no production writes).')
