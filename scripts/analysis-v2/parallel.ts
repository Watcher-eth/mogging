import sharp from 'sharp'
import { evaluateV2 } from '../../lib/analysis-v2/evaluator'
const started = performance.now()
try {
  const image = await sharp('public/model.png').resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()
  const result = await evaluateV2({ imageDataUrl: `data:image/jpeg;base64,${image.toString('base64')}`, geometry: null })
  const timing = { mode: 'v2-parallel-116-rubrics', ...result.timing, scanPreparationAndProviderMs: Math.round(performance.now() - started), rubricCount: result.entries.length, unavailable: result.entries.filter(entry => entry.value === null).length, inputBytes: image.length }
  await Bun.write('../artifacts/analysis-v2/parallel-timing.json', JSON.stringify(timing, null, 2))
  await Bun.write('../artifacts/analysis-v2/parallel-sample-report.json', JSON.stringify(result, null, 2))
  console.log(timing)
} catch (error) {
  console.log({ mode: 'v2-parallel', elapsedMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : 'Failed' })
  process.exitCode = 1
}
