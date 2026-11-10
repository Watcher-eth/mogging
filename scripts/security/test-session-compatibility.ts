import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createHmac } from 'node:crypto'

const root = process.cwd()
const baseline = process.argv[2]
assert.ok(baseline && path.isAbsolute(baseline), 'Pass the credential-free baseline checkout')
const require = createRequire(path.join(root, 'package.json'))
const original = createRequire(path.join(baseline, 'package.json'))('next-auth/jwt')
const postgres = require('postgres').default
const bcrypt = require('bcryptjs')
const database = 'postgresql://security_audit@127.0.0.1:55449/mogging_security_test'
const secret = 'isolated-http-session-fixture-never-use-in-production'
const password = 'SyntheticPasswordOnly-2026'
const base = 'http://127.0.0.1:55457'
const sql = postgres(database, { max: 1 })
const ids = [crypto.randomUUID(), crypto.randomUUID()]
const emails = ids.map(id => `${id}@example.invalid`)
const checks: string[] = []
const jar = new Map<string, string>()
async function request(url: string, init: RequestInit = {}) {
  const response = await fetch(base + url, { ...init, redirect: 'manual', headers: { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '), ...init.headers } })
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0]
    const separator = pair.indexOf('=')
    const key = pair.slice(0, separator), value = pair.slice(separator + 1)
    if (value) jar.set(key, value); else jar.delete(key)
  }
  return response
}
async function check(name: string, run: () => Promise<void>) { await run(); checks.push(name); console.log(`PASS ${name}`) }
const hash = await bcrypt.hash(password, 4)
await sql`insert into users (id, email, name, password_hash) values (${ids[0]}, ${emails[0]}, 'Synthetic member', ${hash}), (${ids[1]}, ${emails[1]}, 'Synthetic admin', ${hash})`
const server = Bun.spawn([process.execPath, '--no-env-file', 'run', 'start', '--hostname', '127.0.0.1', '--port', '55457'], {
  cwd: root,
  env: { PATH: process.env.PATH!, NODE_ENV: 'production', VERCEL_ENV: 'preview', DATABASE_URL: database, NEXTAUTH_URL: base, NEXTAUTH_SECRET: secret, CREATOR_ADMIN_EMAILS: emails[1], CREATOR_ADMIN_PASSWORD: password },
  stdout: Bun.file('/tmp/mogging-session-compatibility-server.log'), stderr: Bun.file('/tmp/mogging-session-compatibility-server-errors.log'),
})
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    try { if ((await request('/api/auth/csrf')).ok) { ready = true; break } } catch {}
    await Bun.sleep(100)
  }
  assert.ok(ready, 'Local server did not become ready')
  await check('credentials login rejects a wrong password and accepts the existing password', async () => {
    const { csrfToken } = await (await request('/api/auth/csrf')).json() as any
    const post = (value: string) => request('/api/auth/callback/credentials', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, email: emails[0], password: value, callbackUrl: base, json: 'true' }) })
    await post('wrong')
    assert.equal((await (await request('/api/auth/session')).json() as any).user, undefined)
    assert.equal((await post(password)).status, 200)
    assert.equal((await (await request('/api/auth/session')).json() as any).user.id, ids[0])
  })
  await check('newly issued session token decodes with the original NextAuth version', async () => {
    const token = jar.get('next-auth.session-token')
    assert.ok(token)
    const payload = await original.decode({ token, secret })
    assert.equal(payload.id, ids[0])
    assert.equal(payload.email, emails[0])
  })
  await check('old encrypted session cookies retain user identity and creator access', async () => {
    jar.set('next-auth.session-token', await original.encode({ secret, token: { id: ids[0], sub: ids[0], email: emails[0], name: 'Legacy fixture' } }))
    assert.equal((await (await request('/api/auth/session')).json() as any).user.id, ids[0])
    const member = await request('/api/user/me')
    assert.equal(member.status, 200)
    assert.equal((await member.json() as any).data.user.id, ids[0])
    const creator = await request('/api/creator')
    assert.equal(creator.status, 200)
    assert.equal((await creator.json() as any).data.profile, null)
    assert.equal(creator.headers.get('cache-control'), 'private, no-store')
    assert.equal((await request('/api/admin/creator')).status, 403)
  })
  await check('legacy admin identity and original unlock cookies remain valid', async () => {
    jar.set('next-auth.session-token', await original.encode({ secret, token: { id: ids[1], sub: ids[1], email: emails[1], name: 'Legacy admin' } }))
    const encoded = Buffer.from(JSON.stringify({ email: emails[1], expiresAt: Date.now() + 60_000 })).toString('base64url')
    jar.set('mogging_creator_admin', `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`)
    const admin = await request('/api/admin/creator')
    assert.equal(admin.status, 200)
    assert.equal(admin.headers.get('cache-control'), 'private, no-store')
    jar.set('next-auth.session-token', await original.encode({ secret, token: { id: ids[0], sub: ids[0], email: emails[1] } }))
    assert.equal((await request('/api/admin/creator')).status, 403)
  })
  await check('sign out clears the authenticated session', async () => {
    const { csrfToken } = await (await request('/api/auth/csrf')).json() as any
    await request('/api/auth/signout', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, callbackUrl: base, json: 'true' }) })
    assert.equal((await (await request('/api/auth/session')).json() as any).user, undefined)
  })
  await Bun.write('docs/qa/security-session-compatibility-2026-10-16.json', JSON.stringify({ checkedAt: new Date().toISOString(), scope: 'Built local Next.js server, real credentials/JWT/session cookies, synthetic local PostgreSQL accounts, no providers.', passed: checks.length, checks }, null, 2) + '\n')
} finally {
  server.kill()
  await server.exited
  await sql`delete from users where id in (${ids[0]}, ${ids[1]})`
  await sql.end()
}
