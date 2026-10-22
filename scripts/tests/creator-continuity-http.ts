import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'

const base = new URL(process.env.CREATOR_TEST_BASE_URL || 'http://localhost:3017')
if (!['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('HTTP continuity tests require a local isolated server')
const landing = await fetch(new URL('/r/continuity-qa', base), { headers: { 'User-Agent': 'iPhone Safari' } })
assert.equal(landing.status, 200)
const cookie = landing.headers.getSetCookie().find(cookie => cookie.startsWith('mogging_creator_attribution='))?.split(';')[0]
assert.ok(cookie, 'Landing must persist its signed referral in an HttpOnly cookie')
const originalToken = decodeURIComponent(cookie.slice(cookie.indexOf('=')+1))
// Every entry platform saves a valid token; only eligible iPhones redirect to recovery.
for (const [agent, login, redirect] of [['Macintosh Safari', false, false], ['iPhone Safari', false, true], ['iPhone Safari', true, false]] as const) {
  const home = new URL('/', base); home.searchParams.set('attribution_token', originalToken);
  if (login) home.searchParams.set('login', '1');
  const response = await fetch(home, { headers: { 'User-Agent': agent }, redirect: 'manual' });
  assert.equal(response.status, redirect ? 307 : 200);
  assert.ok(response.headers.getSetCookie().some(value => value.startsWith(cookie + ';')), 'Homepage must retain the original creator cookie');
}
const untagged = await fetch(base, { headers: { 'User-Agent': 'Macintosh Safari' } });
assert.equal(untagged.headers.getSetCookie().some(value => value.startsWith('mogging_creator_attribution=')), false);
const verifier = randomBytes(32).toString('hex'), state = randomBytes(32).toString('hex')
const challenge = createHash('sha256').update(verifier).digest('hex')
const request = new URL('/api/attribution/browser', base)
request.searchParams.set('state', state); request.searchParams.set('challenge', challenge)
const browser = await fetch(request, { headers: { Cookie: cookie }, redirect: 'manual' })
assert.equal(browser.status, 302)
assert.match(browser.headers.get('cache-control') || '', /no-store/)
const callback = new URL(browser.headers.get('location')!)
assert.equal(callback.protocol, 'mogging:'); assert.equal(callback.hostname, 'creator-recovery')
assert.equal(callback.searchParams.get('state'), state)
assert.equal(callback.searchParams.has('attribution_token'), false)
const ticket = callback.searchParams.get('ticket')!
const mobileInstallId = `mob_${crypto.randomUUID()}`
const redeem = (input: Record<string, string>) => fetch(new URL('/api/attribution/browser', base), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) })
assert.equal((await redeem({ ticket, verifier: 'b'.repeat(64), mobileInstallId })).status, 410)
const redeemed = await redeem({ ticket, verifier, mobileInstallId })
assert.equal(redeemed.status, 200)
const payload = await redeemed.json()
assert.equal(new URL(payload.data.url).searchParams.get('attribution_token'), originalToken)
assert.equal((await redeem({ ticket, verifier, mobileInstallId })).status, 200)
assert.equal((await redeem({ ticket, verifier, mobileInstallId: `mob_${crypto.randomUUID()}` })).status, 410)
const missing = await fetch(request, { redirect: 'manual' })
assert.equal(new URL(missing.headers.get('location')!).searchParams.get('error'), 'not_found')
assert.equal((await fetch(new URL('/api/attribution/browser?state=evil&challenge=bad', base), { redirect: 'manual' })).status, 400)
console.log('PASS real HTTP: landing cookie → fixed browser callback → PKCE redemption → original signed click, retry and replay boundaries, missing-cookie recovery, invalid-state rejection')
