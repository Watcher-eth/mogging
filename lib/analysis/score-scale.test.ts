import { expect, test } from 'bun:test'
import { clampPslScore, pslToOverallScore } from './score-scale'
import { pslScoreSchema, reportPotentialSchema } from './schema'
import { computePslScore } from './scoring'

test('PSL is restricted to 1–8, including potential scores', () => {
  for (const score of [0, .9, 8.1, 10]) {
    expect(pslScoreSchema.safeParse(score).success).toBe(false)
    expect(reportPotentialSchema.shape.score.safeParse(score).success).toBe(false)
  }
  for (const score of [1, 6.4, 8]) expect(pslScoreSchema.safeParse(score).success).toBe(true)
  expect(clampPslScore(0)).toBe(1)
  expect(clampPslScore(10)).toBe(8)
})

test('overall converts PSL once onto the /10 scale', () => {
  expect(pslToOverallScore(6.4)).toBe(8)
  expect(pslToOverallScore(6.7)).toBe(8.4)
  expect(pslToOverallScore(8)).toBe(10)
  expect(pslToOverallScore(1)).toBe(1.3)
  expect(pslToOverallScore(6.4)).not.toBe(6.4)
})

test('weak analysis signals cannot produce a PSL below 1', () => {
  expect(computePslScore({ harmonyScore: 0, dimorphismScore: 0, angularityScore: 0, metricScores: [] })).toBe(1)
})
