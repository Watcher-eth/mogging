import { expect, test } from 'bun:test'
import { mergeWatchRanges, watchedEnough } from './watch-progress'

test('combines sessions and overlapping rewatches without counting time twice', () => {
  const first = mergeWatchRanges([[0, 50], [10, 40]], 100)
  const resumed = mergeWatchRanges([...first, [48, 95]], 100)
  expect(first).toEqual([[0, 50]])
  expect(resumed).toEqual([[0, 95]])
  expect(watchedEnough(resumed, 100)).toBe(true)
  expect(watchedEnough(first, 100)).toBe(false)
})

test('seeking to the end and repeatedly watching one segment cannot complete a video', () => {
  const ranges = mergeWatchRanges([[0, 10], [0, 10], [99, 100]], 100)
  expect(watchedEnough(ranges, 100)).toBe(false)
  expect(watchedEnough([], 0)).toBe(false)
})

test('uses exact fractional duration and clamps invalid or out of bounds coverage', () => {
  expect(watchedEnough(mergeWatchRanges([[0, 4.275]], 4.5), 4.5)).toBe(true)
  expect(mergeWatchRanges([[-3, 10], [90, 200], [15, 14], [NaN, 30]], 100)).toEqual([[0, 10], [90, 100]])
})

test('bounds heavily fragmented coverage without claiming unwatched gaps', () => {
  const ranges = mergeWatchRanges(Array.from({ length: 1100 }, (_, i) => [i * 2, i * 2 + 1]), 3000)
  expect(ranges).toHaveLength(1000)
  expect(watchedEnough(ranges, 3000)).toBe(false)
})
