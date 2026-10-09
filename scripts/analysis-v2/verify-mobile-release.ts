// Run baseline against production, stage against the staged deployment, then verify after promotion.
// Uses only a new release-test account and the bundled public model photo.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { registerUser } from '../../lib/auth/register'
import { createMobileSessionForUser } from '../../lib/auth/mobile-session'
import { db, schema } from '../../lib/db'
import { analysisReportSchema } from '../../lib/analysis/schema'
import { webReportSchema } from '../../lib/analysis-v2/report-schema'

const statePath = '/private/tmp/mogging-mobile-v2-release.json'
const phase = process.argv[2]
const base = process.argv[3] ?? 'https://www.mogging.com'
assert(/^https:\/\/(www\.mogging\.com|mogging-[a-z0-9]+-glimpseback\.vercel\.app)$/.test(base), 'Unexpected release target')
type State = { tag: string; userId: string; sessionToken: string; body: object; old: any; next?: any }

async function request(state: State, path: string, body?: object, requestId?: string) {
  const headers = { Authorization: `Bearer ${state.sessionToken}`, 'Content-Type': 'application/json', ...(requestId ? { 'x-mogging-request-id': requestId } : {}) }
  let json: any
  if (base.endsWith('.vercel.app')) {
    const headerPath = `/private/tmp/${state.tag}-headers`
    const bodyPath = `/private/tmp/${state.tag}-body`
    await writeFile(headerPath, Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join('\n'), { mode: 0o600 })
    if (body) await writeFile(bodyPath, JSON.stringify(body), { mode: 0o600 })
    const child = Bun.spawn(['vercel', 'curl', path, '--deployment', base, '--', '--silent', '--show-error', '--max-time', '125', '--header', `@${headerPath}`, ...(body ? ['--request', 'POST', '--data-binary', `@${bodyPath}`] : [])], { stdout: 'pipe', stderr: 'pipe' })
    const [output, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
    assert.equal(code, 0, 'Staged request failed')
    json = JSON.parse(output)
  } else {
    const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(125_000) })
    assert(response.ok, `Release request failed: ${response.status}`)
    json = await response.json()
  }
  assert(json.data, 'Missing successful response envelope')
  return json.data
}
function validateLegacy(result: any) {
  assert.equal(result.analysis.status, 'complete', 'Evaluation did not complete')
  return analysisReportSchema.parse(result.analysis.metrics.report)
}
async function persist(state: State) {
  await writeFile(statePath, JSON.stringify(state), { mode: 0o600 })
}

if (phase === 'retry-baseline') {
  const state: State = JSON.parse(await readFile(statePath, 'utf8'))
  assert(state.tag.startsWith('mobile-v2-release-') && !state.old)
  state.tag += '-retry'
  const started = performance.now()
  state.old = await request(state, '/api/analyze', state.body, `${state.tag}-old`)
  await persist(state)
  validateLegacy(state.old)
  assert(!state.old.analysis.metrics.webReportV2)
  assert.equal(state.old.entitlements.evaluationCredits, 1, 'Failed scan was not refunded')
  console.log(JSON.stringify({ phase, legacyComplete: true, failedScanRefunded: true, elapsedMs: Math.round(performance.now() - started) }))
} else if (phase === 'baseline') {
  assert.equal(base, 'https://www.mogging.com')
  const tag = `mobile-v2-release-${crypto.randomUUID()}`
  const user = await registerUser({ email: `${tag}@mogging.local`, password: crypto.randomUUID() + crypto.randomUUID(), name: 'Mobile v2 release verification' })
  await db.insert(schema.paymentEntitlements).values({ userId: user.id, mobileInstallId: tag, stripeCheckoutSessionId: tag, product: 'evaluation', creditBalance: 2, source: 'release_verification', creditExpiresAt: new Date(Date.now() + 86400000), metadata: { test: true, release: 'mobile-v2' } })
  const session = await createMobileSessionForUser(user.id)
  // Unique JPEG metadata prevents the legacy global image-hash dedupe from touching any existing photo.
  const image = await sharp('public/model.png').resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).withExif({ IFD0: { ImageDescription: tag } }).jpeg({ quality: 88 }).toBuffer()
  const state: State = { tag, userId: user.id, sessionToken: session.sessionToken, body: { imageData: `data:image/jpeg;base64,${image.toString('base64')}`, gender: 'other', photoType: 'face', name: 'Mobile release sample' }, old: null }
  await persist(state)
  const started = performance.now()
  state.old = await request(state, '/api/analyze', state.body, `${tag}-old`)
  validateLegacy(state.old)
  assert(!state.old.analysis.metrics.webReportV2, 'Legacy endpoint returned v2')
  assert.equal(state.old.entitlements.evaluationCredits, 1)
  await persist(state)
  console.log(JSON.stringify({ phase, legacyComplete: true, elapsedMs: Math.round(performance.now() - started) }))
} else {
  const state: State = JSON.parse(await readFile(statePath, 'utf8'))
  assert(state.tag.startsWith('mobile-v2-release-') && state.old, 'Missing release-test baseline')
  const oldSaved = await request(state, `/api/analysis/${state.old.analysis.id}`)
  assert.deepEqual(oldSaved.analysis.metrics, state.old.analysis.metrics, 'Existing saved report changed')
  const oldReplay = await request(state, '/api/analyze', state.body, `${state.tag}-old`)
  assert.equal(oldReplay.analysis.id, state.old.analysis.id, 'Old request replay created another report')
  if (phase === 'stage') {
    const started = performance.now()
    state.next = await request(state, '/api/mobile/v2/analyze', state.body, `${state.tag}-new`)
    const compatible = validateLegacy(state.next)
    const expanded = webReportSchema.parse(state.next.analysis.metrics.webReportV2)
    assert(expanded.entries.filter(entry => entry.value !== null).length >= 25)
    assert(expanded.categories.some(category => category.recommendation?.length), 'Mobile recommendations missing')
    assert.notEqual(state.next.photo.id, state.old.photo.id, 'New route reused legacy photo')
    assert.equal(state.next.entitlements.evaluationCredits, 0)
    await persist(state)
    console.log(JSON.stringify({ phase, mobileComplete: true, legacyCategories: compatible.categories.length, expandedCategories: expanded.categories.length, supported: expanded.entries.filter(entry => entry.value !== null).length, elapsedMs: Math.round(performance.now() - started) }))
  } else assert.equal(phase, 'verify')
  const nextSaved = await request(state, `/api/analysis/${state.next.analysis.id}`)
  assert.deepEqual(nextSaved.analysis.metrics, state.next.analysis.metrics)
  const nextReplay = await request(state, '/api/mobile/v2/analyze', state.body, `${state.tag}-new`)
  assert.equal(nextReplay.analysis.id, state.next.analysis.id)
  assert.equal(nextReplay.entitlements.evaluationCredits, 0, 'Replay used another credit')
  const oldAgain = await request(state, `/api/analysis/${state.old.analysis.id}`)
  assert.deepEqual(oldAgain.analysis.metrics, state.old.analysis.metrics, 'V2 evaluation altered legacy report')
  console.log(JSON.stringify({ phase, savedReportsUnchanged: true, legacyReplaySafe: true, mobileReplaySafe: true, customerCreditsUsed: 0 }))
}
process.exit(0)
