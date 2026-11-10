import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const candidate = process.cwd()
const baseline = process.argv[2]
assert.ok(baseline && path.isAbsolute(baseline), 'Pass the credential-free baseline checkout')
const database = 'postgresql://security_audit@127.0.0.1:55449/mogging_security_test'
const env = {
  PATH: process.env.PATH!, NODE_ENV: 'test', NO_COLOR: '1',
  DATABASE_URL: database, NEXTAUTH_URL: 'http://localhost:3000',
  NEXTAUTH_SECRET: 'isolated-compatibility-fixture-never-use-in-production',
  TEST_ANALYTICS_DATABASE_URL: database.replace(':55449/', ':55448/'),
  TEST_CREATOR_INVITE_DATABASE_URL: database.replace(':55449/', ':55439/'),
  TEST_BUNDLED_PAYOUT_DATABASE_URL: database.replace(':55449/', ':55448/'),
  TEST_PUSH_DATABASE_URL: database.replace(':55449/', ':55448/'),
}
const files = ['lib', 'components'].flatMap(folder => [...new Bun.Glob(`${folder}/**/*.test.{ts,tsx}`).scanSync(baseline)]).sort()
type Result = { file: string; code: number; passed: number; failed: number; skipped: number; timedOut: boolean }
async function suite(root: string, label: string) {
  const results: Result[] = []
  for (const file of files) {
    const child = Bun.spawn([process.execPath, '--no-env-file', 'test', file, '--timeout', '10000'], { cwd: root, env, stdout: 'pipe', stderr: 'pipe' })
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill() }, 60_000)
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    clearTimeout(timer)
    const output = stdout + stderr
    const result = { file, code, passed: Number(output.match(/^\s*(\d+) pass\s*$/m)?.[1] || 0), failed: Number(output.match(/^\s*(\d+) fail\s*$/m)?.[1] || 0), skipped: Number(output.match(/^\s*(\d+) skip\s*$/m)?.[1] || 0), timedOut }
    results.push(result)
    const log = path.join(candidate, '.local', 'compatibility-output', label, file + '.log')
    await mkdir(path.dirname(log), { recursive: true })
    await Bun.write(log, output)
    if (code !== 0) console.log(`${label}: FAIL ${file}`)
    if (results.length % 25 === 0) console.log(`${label}: ${results.length}/${files.length} files`)
  }
  return results
}
const before = await suite(baseline, 'baseline')
const after = await suite(candidate, 'candidate')
const regressions = after.filter((result, i) => before[i].code === 0 && result.code !== 0)
const failures = after.filter(result => result.code !== 0)
const summarize = (rows: Result[]) => ({ files: rows.length, passed: rows.reduce((n, r) => n + r.passed, 0), failed: rows.reduce((n, r) => n + r.failed, 0), skipped: rows.reduce((n, r) => n + r.skipped, 0), failingFiles: rows.filter(r => r.code !== 0).map(r => r.file) })
const report = { checkedAt: new Date().toISOString(), scope: 'Each test file in a separate process, identical synthetic environment, local fixture databases only; no production credentials.', baseline: summarize(before), candidate: summarize(after), regressions, unchangedFailures: failures.filter(result => !regressions.includes(result)), results: { baseline: before, candidate: after } }
await Bun.write('docs/qa/security-compatibility-comparison-2026-10-16.json', JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify({ baseline: report.baseline, candidate: report.candidate, newFailingFiles: regressions.length }))
if (regressions.length) process.exitCode = 1
