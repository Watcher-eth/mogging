import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'

const baseline = process.argv[2]
assert.ok(baseline && path.isAbsolute(baseline), 'Pass the credential-free baseline checkout')
function internals(root: string) {
  const require = createRequire(path.join(root, 'package.json'))
  const directory = path.dirname(require.resolve('next-auth'))
  return { checks: require(path.join(directory, 'core/lib/oauth/checks.js')), cookies: require(path.join(directory, 'core/lib/cookie.js')).defaultCookies(false) }
}
const original = internals(baseline)
const candidate = internals(process.cwd())
const options = {
  cookies: original.cookies, provider: { id: 'google', checks: ['state', 'pkce', 'nonce'] },
  jwt: { secret: 'isolated-oauth-compatibility-fixture-not-production' }, logger: { debug() {} },
}
const results = []
for (const type of ['state', 'pkce', 'nonce']) {
  const cookies: any[] = [], parameters = {}
  await original.checks[type].create(options, cookies, parameters)
  const request = Object.fromEntries(cookies.map(cookie => [cookie.name, cookie.value]))
  await original.checks[type].use(request, [], options, {})
  try {
    await candidate.checks[type].use(request, [], options, {})
    results.push({ type, legacyCookieAccepted: true })
  } catch (error) {
    results.push({ type, legacyCookieAccepted: false, reason: (error as Error).message })
  }
}
const report = { checkedAt: new Date().toISOString(), scope: 'Actual NextAuth OAuth-check functions and encrypted legacy cookies; synthetic secret, no provider requests.', results }
const destination = process.argv[3] || 'docs/qa/security-oauth-compatibility-2026-10-16.json'
await Bun.write(destination, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
if (results.some(result => !result.legacyCookieAccepted)) process.exitCode = 1
