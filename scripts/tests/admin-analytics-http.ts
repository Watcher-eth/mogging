import assert from 'node:assert/strict'
import { encode } from 'next-auth/jwt'
import { createHmac } from 'node:crypto'

// Only the isolated preview: never accepts a production URL or real admin credentials.
const base = 'http://127.0.0.1:3107'
const secret = 'analytics-local-test-only'
async function cookies(email: string, unlocked: boolean) {
  const token = await encode({ secret, token: { id: 'analytics-preview', email, name: 'Local test', picture: null }, maxAge: 3600 })
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + 3600_000 })).toString('base64url')
  const signature = createHmac('sha256', secret).update(payload).digest('base64url')
  return `next-auth.session-token=${token}${unlocked ? `; mogging_creator_admin=${payload}.${signature}` : ''}`
}
const endpoint = `${base}/api/admin/analytics`
assert.equal((await fetch(endpoint)).status, 401)
assert.equal((await fetch(endpoint, { method: 'POST' })).status, 405)
assert.equal((await fetch(endpoint, { headers: { cookie: await cookies('outsider@example.invalid', true) } })).status, 403)
assert.equal((await fetch(endpoint, { headers: { cookie: await cookies('analytics-test@example.invalid', false) } })).status, 401)
const headers = { cookie: await cookies('analytics-test@example.invalid', true) }
assert.equal((await fetch(`${endpoint}?days=999`, { headers })).status, 400)
const first = await fetch(`${endpoint}?days=30&platform=all`, { headers })
assert.equal(first.status, 200)
assert.match(first.headers.get('cache-control') || '', /no-store/)
const data = await first.json()
const repeated = await (await fetch(`${endpoint}?days=30&platform=all`, { headers })).json()
assert.equal(repeated.data.generatedAt, data.data.generatedAt)
assert.equal(data.data.filters.days, '30')
assert.ok(Array.isArray(data.data.revenue))
console.log('PASS: unauthenticated, locked, non-admin, method, filter validation, authorized response, private cache headers, and snapshot reuse')
const operations = `${base}/api/admin/analytics-operations`
assert.equal((await fetch(operations)).status, 401)
assert.equal((await fetch(operations, { method: 'POST' })).status, 405)
assert.equal((await fetch(operations, { headers: { cookie: await cookies('outsider@example.invalid', true) } })).status, 403)
assert.equal((await fetch(operations, { headers: { cookie: await cookies('analytics-test@example.invalid', false) } })).status, 401)
const invalid = await fetch(`${operations}?days=999&section=Authentication`, { headers })
assert.equal(invalid.status, 400)
assert.match(invalid.headers.get('cache-control') || '', /private, no-store/)
assert.equal((await fetch(`${operations}?days=30&section=Unknown`, { headers })).status, 400)
console.log('PASS: operational reporting authorization, method, filters, and private headers')
