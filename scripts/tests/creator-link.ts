import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

let clicks = 0
let accounts = 0
mock.module('@/lib/creator/attribution', () => ({
  createCreatorAttributionClick: async ({ slug, userAgent }: { slug: string; userAgent: string }) => {
    if (slug !== 'creator-test') return null
    clicks++
    return { token: 'test-signed-token', isBot: userAgent === 'bot', click: { isBot: userAgent === 'bot' },
      deepLinkUrl: 'mogging://r/creator-test?attribution_token=test-signed-token',
      link: { slug, socialAccountId: 'account', iosAppStoreUrl: 'https://apps.apple.com/app/id6771414050', androidAppStoreUrl: null } }
  },
  setCreatorAttributionCookie: () => {},
}))
mock.module('@/lib/auth/anonymous', () => ({ getOrSetAnonymousActorId: () => 'visitor' }))
mock.module('@/lib/api/rateLimit', () => ({ enforceRateLimit: async () => {} }))
mock.module('@/lib/db', () => ({ schema: {}, db: { query: { creatorSocialAccounts: { findFirst: async () => {
  accounts++
  return { handle: 'creator', displayName: null, platform: 'tiktok' }
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
assert.equal((await page('iPhone Safari')).redirect.destination, 'https://apps.apple.com/app/id6771414050')
assert.equal(accounts, 0, 'store redirects must skip the account lookup')
assert.equal((await page('iPhone Instagram')).props.code, 'creator-test')
assert.equal((await page('iPhone Safari', { fallback: '1' })).props.code, 'creator-test')
assert.equal((await page('Android')).props.storeUrl, null, 'Android must never receive an iOS store fallback')
assert.equal((await page('bot')).props.code, 'creator-test')
assert.match((await page('Macintosh Safari')).redirect.destination, /^https:\/\/www.mogging.com\/\?utm_source=tiktok/)
assert.equal((await page('iPhone', {}, 'inactive')).notFound, true)
for (const [method, slug, status] of [['GET', 'creator-test', 405], ['POST', 'bad code', 400], ['POST', 'inactive', 404], ['POST', 'creator-test', 200]] as const) {
  const res = response()
  await handler({ method, headers: { 'user-agent': 'Mogging iOS' }, body: { slug } } as any, res as any)
  assert.equal(res.statusCode, status)
  if (status === 200) assert.match(res.body.data.url, /^mogging:\/\/r\/creator-test/)
}
assert.ok(clicks > 0)
console.log('Creator routing and code endpoint checks passed (mocked database; no production writes).')
