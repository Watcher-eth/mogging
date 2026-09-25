import { expect, test } from 'bun:test'
import { estimatedPopulationTopPercent } from './population-percentile'

test('only eligible scores receive the modeled population estimate', () => {
  for (const score of [0, 4.99, 10.01, NaN, Infinity]) expect(estimatedPopulationTopPercent(score)).toBeNull()
  expect(estimatedPopulationTopPercent(5)).toBe(50)
  expect(estimatedPopulationTopPercent(6)).toBe(25.2)
  expect(estimatedPopulationTopPercent(7)).toBe(9.1)
  expect(estimatedPopulationTopPercent(8)).toBe(2.3)
  expect(estimatedPopulationTopPercent(9)).toBe(0.4)
  expect(estimatedPopulationTopPercent(10)).toBe(0.1)
})

test('higher scores never produce a worse percentile or a zero-percent claim', () => {
  let previous = 50
  for (let tenths = 50; tenths <= 100; tenths++) {
    const percent = estimatedPopulationTopPercent(tenths / 10)!
    expect(percent).toBeGreaterThan(0)
    expect(percent).toBeLessThanOrEqual(previous)
    previous = percent
  }
})
