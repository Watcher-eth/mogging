import assert from 'node:assert/strict'
import test from 'node:test'
import { createFallbackAnalysisReport } from './report'

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
