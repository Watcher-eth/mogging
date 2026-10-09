import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
import { analyzeAndSaveWeb } from '../../lib/analysis-v2/production'
import { webReportSchema } from '../../lib/analysis-v2/report-schema'
import { analysisReportSchema } from '../../lib/analysis/schema'

const image = await sharp('public/model.png').resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
const input = { imageData: `data:image/jpeg;base64,${image.toString('base64')}`, gender: 'other' as const, photoType: 'face' as const, name: 'Web v2 release verification', anonymousActorId: crypto.randomUUID() }
const started = performance.now()
const result = await analyzeAndSaveWeb(input)
await writeFile('/private/tmp/mogging-web-v2-smoke.json', JSON.stringify(result))
if (result.analysis.status !== 'complete') throw new Error(result.analysis.failureReason ?? 'Analysis failed')
const metrics = result.analysis.metrics as Record<string, unknown>
const web = webReportSchema.parse(metrics.webReportV2)
analysisReportSchema.parse(metrics.report)
console.log(JSON.stringify({ elapsedMs: Math.round(performance.now()-started), status: result.analysis.status, id: result.analysis.id, categories: web.categories.length, supported: web.entries.filter(entry => entry.value !== null).length, modelMs: web.timingMs, legacyCompatible: true }))
process.exit(0)
