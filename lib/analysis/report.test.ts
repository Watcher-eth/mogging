import assert from 'node:assert/strict'
import test from 'node:test'
import { analysisReportSchema, protocolContextSchema } from './schema'
import { createFallbackAnalysisReport, normalizeAnalysisReport } from './report'

test('overall report uses scored facial qualities instead of social pseudo-metrics', () => {
  const report = createFallbackAnalysisReport({
    faceDetected: true,
    pslScore: 5.8,
    harmonyScore: 6.4,
    symmetryScore: 6.8,
    proportionalityScore: 6.2,
    averagenessScore: 6.1,
    dimorphismScore: 5.9,
    angularityScore: 6.3,
    metricScores: [
      { name: 'Skin quality', score: 6.6, category: 'skin' },
      { name: 'Presentation', score: 6.2, category: 'presentation' },
    ],
    landmarks: {},
  }, 5.8)

  const overall = report.categories.find((category) => category.id === 'overall')
  assert.deepEqual(overall?.features.map((feature) => feature.label), [
    'Eye area',
    'Jaw & chin',
    'Cheekbone structure',
    'Facial thirds',
    'Symmetry',
    'Skin quality',
  ])
  assert.ok(overall?.features.every((feature) => /^\d+\.\d\/10$/.test(feature.value)))
  assert.doesNotMatch(JSON.stringify(overall), /market fit|approachability|distinctiveness|versatility|archetype/i)
})

test('normalization keeps eye color and measured feature values', () => {
  const input = createFallbackAnalysisReport({
    faceDetected: true,
    pslScore: 5.8,
    harmonyScore: 6.4,
    dimorphismScore: 5.9,
    angularityScore: 6.3,
    metricScores: [],
    landmarks: {},
  }, 5.8)
  const eyes = input.categories.find((category) => category.id === 'eyes')!
  eyes.eyeColor = 'green'
  eyes.features[0].measurement = '3.2°'

  const normalized = normalizeAnalysisReport(input, 5.8)
  const output = normalized?.categories.find((category) => category.id === 'eyes')
  assert.equal(output?.eyeColor, 'green')
  assert.equal(output?.features[0].measurement, '3.2°')
})


test('normalization preserves optional visual context for the automatic protocol', () => {
  const input = createFallbackAnalysisReport({ faceDetected: true, pslScore: 5.8, harmonyScore: 6.4, dimorphismScore: 5.9, angularityScore: 6.3, metricScores: [], landmarks: {} }, 5.8)
  input.protocolContext = { faceShape: 'round', hairTexture: 'curly', visibleConcerns: ['sparse-brows'] }
  assert.deepEqual(normalizeAnalysisReport(input, 5.8)?.protocolContext, input.protocolContext)
  assert.equal(protocolContextSchema.safeParse({ visibleConcerns: ['jaw-tension'] }).success, false)
  assert.equal(analysisReportSchema.shape.protocolContext.parse({ visibleConcerns: ['jaw-tension'] }), undefined)
  assert.equal(protocolContextSchema.safeParse({ faceShape: 'round', visibleConcerns: ['dry-lips'] }).success, true)
})
