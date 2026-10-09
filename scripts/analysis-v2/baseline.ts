import { KimiAnalysisProvider } from '../../lib/analysis/providers/kimi'
const started = performance.now()
try {
  const bytes = await Bun.file('public/model.png').arrayBuffer()
  const result = await new KimiAnalysisProvider().analyzeFace({ imageDataUrl: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`, gender: 'other' })
  const timing = { mode: 'v1-provider-only', elapsedMs: Math.round(performance.now() - started), faceDetected: result.faceDetected, categoryCount: result.report?.categories.length ?? 0, inputBytes: bytes.byteLength }
  await Bun.write('../artifacts/analysis-v2/baseline-timing.json', JSON.stringify(timing, null, 2))
  console.log(timing)
} catch (error) {
  const failure = { mode: 'v1-provider-only', elapsedMs: Math.round(performance.now() - started), error: error instanceof Error ? error.message : 'Failed', validationDetails: error instanceof Error && 'raw' in error ? error.raw : null }
  await Bun.write('../artifacts/analysis-v2/baseline-timing.json', JSON.stringify(failure, null, 2))
  console.log(failure)
  process.exitCode = 1
}
