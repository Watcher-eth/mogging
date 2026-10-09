import sharp from 'sharp'
import { readFile, writeFile } from 'node:fs/promises'
import { createMobileSessionForUser } from '../../lib/auth/mobile-session'
import { webReportSchema } from '../../lib/analysis-v2/report-schema'
import { analysisReportSchema } from '../../lib/analysis/schema'

const baseUrl = 'https://www.mogging.com'
const account = JSON.parse(await readFile('/private/tmp/mogging-web-v2-test-account.json', 'utf8'))
const session = await createMobileSessionForUser(account.userId)
const headers = { Authorization: `Bearer ${session.sessionToken}`, 'Content-Type': 'application/json', 'x-mogging-request-id': `${account.tag}-scan` }
const image = await sharp('public/model.png').resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
const body = { imageData: `data:image/jpeg;base64,${image.toString('base64')}`, gender: 'other', photoType: 'face', name: 'Web v2 release verification' }
const started = performance.now()
const response = await fetch(`${baseUrl}/api/web/analyze`, { method: 'POST', headers, body: JSON.stringify(body) })
const json = await response.json()
if (!response.ok) throw new Error(JSON.stringify(json))
const result = json.data
await writeFile('/private/tmp/mogging-web-v2-production.json', JSON.stringify({ ...result, testSessionToken: session.sessionToken, userId: account.userId }), { mode: 0o600 })
if (result.analysis.status !== 'complete') throw new Error(JSON.stringify(result.analysis.metrics.providerError))
const web = webReportSchema.parse(result.analysis.metrics.webReportV2)
analysisReportSchema.parse(result.analysis.metrics.report)
const loaded = await fetch(`${baseUrl}/api/analysis/${result.analysis.id}`, { headers })
const reloaded = (await loaded.json()).data
if (!loaded.ok || reloaded.analysis.metrics.webReportV2.version !== 2) throw new Error('Saved report did not reload')
// Replay the same real request: it must return the same saved report without a second credit or provider call.
const replay = await fetch(`${baseUrl}/api/web/analyze`, { method: 'POST', headers, body: JSON.stringify(body) })
const replayData = (await replay.json()).data
if (!replay.ok || replayData.analysis.id !== result.analysis.id || replayData.entitlements.evaluationCredits !== 0) throw new Error('Idempotent scan replay failed')
console.log(JSON.stringify({ elapsedMs: Math.round(performance.now()-started), status: response.status, id: result.analysis.id, modelMs: web.timingMs, categories: web.categories.length, supported: web.entries.filter(entry => entry.value !== null).length, remainingTestCredits: result.entitlements.evaluationCredits, legacyCompatible: true, savedReload: true, replaySafe: true }))
process.exit(0)
