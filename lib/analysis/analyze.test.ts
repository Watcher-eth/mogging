import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { z } from 'zod'
import { hairColorSchema, normalizeApparentAge, skinColorSchema } from '@/lib/appearance/types'
import { faceLandmarksPayloadSchema } from './landmarks'
import { analysisProviderResultSchema } from './schema'
import { createFallbackAnalysisReport, normalizeAnalysisReport } from './report'
import { computePslScore } from './scoring'
import { toAnalysisFailure } from './errors'
import { ApiError } from '@/lib/api/http'

const source = readFileSync(new URL('./analyze.ts', import.meta.url), 'utf8').replace(/^import[\s\S]*?from [^\n]+\n/gm, '').replace(/^export /gm, '')
const input = { imageData: 'public test fixture', gender: 'other', userId: 'test-owner' }
function fixture({ storageFails = false, avatarFails = false } = {}) {
  let saved = 0
  let providerCalls = 0
  const providerResult = analysisProviderResultSchema.parse({ faceDetected: true, pslScore: 5, harmonyScore: 6, dimorphismScore: 6, angularityScore: 6 })
  const context: any = { z, ApiError, hairColorSchema, normalizeApparentAge, skinColorSchema, faceLandmarksPayloadSchema, createFallbackAnalysisReport, normalizeAnalysisReport, computePslScore, toAnalysisFailure,
    ANALYSIS_PROMPT_VERSION: 'fixture', Date, console: { info() {}, warn() {}, error() {} },
    analysisProvider: { model: 'fixture', analyzeFace: async () => { providerCalls++; return providerResult } },
    storeImageDataUrl: async () => { if (storageFails) throw new Error('storage failed'); return { imageUrl: '/test.jpg', imageHash: 'a'.repeat(64), imageStorageKey: 'test.jpg' } },
    updateUserAvatarIfMissing: async () => { if (avatarFails) throw new Error('avatar write failed') },
    createPhotoRecord: async () => ({ photo: { id: 'test-photo' }, deduped: false }),
    saveAnalysisResult: async (value: unknown) => { saved++; return { analysis: { ...value as object, id: 'test-analysis' } } },
    computeImageHash: () => 'a'.repeat(64),
  }
  runInNewContext(new Bun.Transpiler({ loader: 'ts' }).transformSync(source) + '\nglobalThis.run = analyzeAndSave', context)
  return { run: context.run, saved: () => saved, providerCalls: () => providerCalls }
}

test('an avatar-update error cannot discard an otherwise complete persisted report', async () => {
  const f = fixture({ avatarFails: true })
  const result = await f.run(input, 'reserved-scan')
  expect(result.analysis.status).toBe('complete')
  expect(result.analysis.metrics.report.categories).toHaveLength(11)
  expect(f.saved()).toBe(1)
})
test('paid legacy scans cannot return temporary success when image persistence fails', async () => {
  const f = fixture({ storageFails: true })
  await expect(f.run(input, 'reserved-scan')).rejects.toThrow('Unable to save the report image')
  await expect(f.run(input, 'reserved-scan')).rejects.toMatchObject({ status: 503 })
  expect(f.saved()).toBe(0)
  expect(f.providerCalls()).toBe(0)
})
test('explicit persistence requirement also protects the expanded scan path', async () => {
  const f = fixture({ storageFails: true })
  await expect(f.run(input, undefined, { requirePersistence: true })).rejects.toThrow('scan credit is still available')
  expect(f.saved()).toBe(0)
})
