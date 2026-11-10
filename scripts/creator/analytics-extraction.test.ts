import { expect, test } from 'bun:test'
import { optionalMetricCandidates, readCountryRows, selectAnalyticsFrames, summarizeCountries, type OcrFrame, type OcrLine } from './analytics-extraction'

const line = (text: string, x: number, y: number): OcrLine => ({ text, x, y, confidence: 0.95, width: 0.2, height: 0.02 })
const frame = (lines: OcrLine[]): OcrFrame => ({ path: 'frame.jpg', timestamp: 10, lines })

test('pairs country labels with percentages on the same row and accepts decimal commas', () => {
  const rows = readCountryRows(frame([line('United States', 0.1, 0.1), line('32,5%', 0.7, 0.1),
    line('Germany 5.2%', 0.1, 0.2), line('Brazil', 0.1, 0.3), line('8.1%', 0.7, 0.3)]))
  expect(rows.map(row => [row.country, row.percent])).toEqual([['United States', 32.5], ['Germany', 5.2], ['Brazil', 8.1]])
  expect(summarizeCountries(rows).observedTier1Percent).toBe(37.7)
})

test('leaves ambiguous row values unknown', () => {
  expect(readCountryRows(frame([line('Canada', 0.1, 0.1), line('12%', 0.6, 0.1), line('20%', 0.8, 0.1)]))).toEqual([])
})

test('deduplicates scrolling repetitions and flags conflicting readings', () => {
  const rows = [{ country: 'Canada', percent: 12, timestamp: 10, raw: '' },
    { country: 'Canada', percent: 12, timestamp: 11, raw: '' }]
  expect(summarizeCountries(rows).observedTier1Percent).toBe(12)
  const conflict = summarizeCountries([...rows, { ...rows[0], percent: 72, timestamp: 12 }])
  expect(conflict.countries[0].percent).toBeNull()
  expect(conflict.countries[0].conflictingValues).toEqual([12, 72])
})

test('never treats an incomplete visible list as the complete Tier 1 share', () => {
  const result = summarizeCountries([{ country: 'United States', percent: 20, timestamp: 10, raw: '' }])
  expect(result.completeTier1Percent).toBeNull()
  expect(result.needsReview).toBe(true)
  expect(result.reasons).toContain('Audience scope and list completeness need verification')
  expect(summarizeCountries([]).observedTier1Percent).toBeNull()
})

test('selects distinct scrolled audience and age content instead of repeated frames', () => {
  const a = frame([line('Canada 12%', 0.1, 0.1), line('18 - 24', 0.1, 0.2)])
  const b = { ...a, timestamp: 11 }
  const c = { ...frame([line('Germany 5%', 0.1, 0.1), line('55+', 0.1, 0.2)]), timestamp: 12 }
  expect(selectAnalyticsFrames([a, b, c]).map(f => f.timestamp)).toEqual([10, 12])
})

test('retains optional labels and nearby evidence without inventing their values', () => {
  const result = optionalMetricCandidates([frame([line('Average watch time', 0.1, 0.1), line('6.4s', 0.1, 0.13)])])
  expect(result).toEqual([{ timestamp: 10, label: 'Average watch time', nearbyText: ['Average watch time', '6.4s'] }])
})
