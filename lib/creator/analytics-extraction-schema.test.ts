import { expect, test } from 'bun:test'
import type { z } from 'zod'
import { extractionSchema, parseAnalyticsExtraction } from './analytics-extraction-schema'

const screenshotReading = {
  scope: 'post_viewers',
  issues: [],
  countries: [
    { code: 'US', percent: 94.6, precision: 1, frameIds: ['locations-1'] },
    { code: 'CA', percent: 0.6, precision: 1, frameIds: ['locations-1'] },
    { code: 'DE', percent: 0.5, precision: 1, frameIds: ['locations-1'] },
    { code: 'BR', percent: 0.3, precision: 1, frameIds: ['locations-1'] },
    { code: 'ES', percent: 0.3, precision: 1, frameIds: ['locations-1', 'locations-2'] },
    { code: 'GB', percent: 0.3, precision: 1, frameIds: ['locations-2'] },
    { code: 'FR', percent: 0.2, precision: 1, frameIds: ['locations-2'] },
    { code: 'MX', percent: 0.2, precision: 1, frameIds: ['locations-2'] },
    { code: 'PR', percent: 0.2, precision: 1, frameIds: ['locations-2'] },
  ],
  otherPercent: null,
  totalViews: 2998,
  totalViewsExact: true,
  totalPlayTimeSeconds: 24605,
  averageWatchTimeSeconds: 8.1,
  watchedFullVideoPercent: 9.32,
  newFollowers: 1,
  postSummary: { postedAtLabel: 'Nov 3, 2026, 1:17 PM', likes: 51, comments: 1, shares: 3, saves: 6 },
  dropOffTimeSeconds: null,
  totalViewers: 2600,
  totalViewersChange: { count: 19, comparisonLabel: 'vs 1d ago' },
  viewerTypes: { newViewersPercent: 83, returningViewersPercent: 17, nonFollowersPercent: 100, followersPercent: 0 },
  gender: [{ label: 'Male', percent: 90 }, { label: 'Female', percent: 9 }, { label: 'Other', percent: 1 }],
  age: [{ range: '18 - 24', percent: 62 }, { range: '25 - 34', percent: 25 }, { range: '35 - 44', percent: 7 },
    { range: '45 - 54', percent: 5 }, { range: '55+', percent: 1 }],
} satisfies z.infer<typeof extractionSchema>

test('retains the Overview and Viewers readings in the same analytics payload', () => {
  expect(extractionSchema.parse(screenshotReading)).toEqual(screenshotReading)
  expect(parseAnalyticsExtraction(screenshotReading)).toEqual(screenshotReading)
})

test('keeps valid readings when extra metrics are unavailable or invalid', () => {
  const result = parseAnalyticsExtraction({
    ...screenshotReading,
    totalPlayTimeSeconds: null,
    watchedFullVideoPercent: 101,
    newFollowers: -1,
    viewerTypes: { nonFollowersPercent: 100, followersPercent: 0 },
    gender: undefined,
  })
  expect(result.countries).toEqual(screenshotReading.countries)
  expect(result.totalPlayTimeSeconds).toBeNull()
  expect(result.watchedFullVideoPercent).toBeUndefined()
  expect(result.newFollowers).toBeUndefined()
  expect(result.viewerTypes).toEqual({ nonFollowersPercent: 100, followersPercent: 0 })
  expect(result.gender).toBeUndefined()
  expect(result.age).toEqual(screenshotReading.age)
})
