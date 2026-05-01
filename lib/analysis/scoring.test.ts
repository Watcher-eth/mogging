import assert from 'node:assert/strict'
import test from 'node:test'
import { computePslScore } from './scoring'
import { analysisProviderResultSchema } from './schema'

test('computePslScore weights proportionality, averageness, and dimorphism above symmetry', () => {
  const result = {
    faceDetected: true,
    harmonyScore: 4,
    symmetryScore: 2,
    proportionalityScore: 6,
    averagenessScore: 6,
    dimorphismScore: 5,
    angularityScore: 4,
    metricScores: [
      { name: 'Skin clarity and texture', score: 4, category: 'skin' as const },
      { name: 'Photo quality and expression neutrality', score: 4, category: 'presentation' as const },
    ],
    landmarks: {},
  }

  assert.equal(computePslScore(result), 3.8)
})

test('computePslScore falls back to category averages when top-level optional scores are absent', () => {
  const result = {
    faceDetected: true,
    harmonyScore: 4,
    dimorphismScore: 4,
    angularityScore: 4,
    metricScores: [
      { name: 'Symmetry A', score: 2, category: 'symmetry' as const },
      { name: 'Symmetry B', score: 4, category: 'symmetry' as const },
      { name: 'Proportionality', score: 6, category: 'proportionality' as const },
      { name: 'Averageness', score: 5, category: 'averageness' as const },
    ],
    landmarks: {},
  }

  assert.equal(computePslScore(result), 3.6)
})

test('computePslScore accepts provider PSL on the 0-8 scale', () => {
  const result = {
    faceDetected: true,
    pslScore: 7.7,
    harmonyScore: 9,
    dimorphismScore: 7,
    angularityScore: 8,
    metricScores: [],
    landmarks: {},
  }

  assert.equal(computePslScore(result), 7.7)
})

test('analysisProviderResultSchema rejects invalid metric categories and out-of-range PSL scores', () => {
  const result = analysisProviderResultSchema.safeParse({
    faceDetected: true,
    pslScore: 9,
    harmonyScore: 8,
    dimorphismScore: 4,
    angularityScore: 4,
    metricScores: [
      { name: 'Bad metric', score: 4, category: 'golden_ratio' },
    ],
    landmarks: {},
  })

  assert.equal(result.success, false)
})
