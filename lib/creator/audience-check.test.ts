import { expect, test } from 'bun:test'
import { assessAudience, audienceReviewError, audienceListTotalConsistent, stableAudiencePayout, verifiedRecordingViews, type AudienceCheck, type AudienceCountry } from './audience-check'
import { defaultCreatorSprintTerms } from './sprint-defaults'

const terms = defaultCreatorSprintTerms()
const country = (code: string, name: string, percent: number): AudienceCountry => ({ code, name, percent, precision: 1, frameIds: ['tail-1', 'tail-2'] })

test('earnings use only exact independently verified views from the current recording, even if audience needs review', () => {
  const check: AudienceCheck = { version: 1, storageKey: 'current', status: 'needs_review',
    metrics: { totalViews: 123456, totalViewsExact: true, totalViewers: null, averageWatchTimeSeconds: null, age: [] },
    metricsVerified: { totalViews: true, totalViewsExact: true } }
  expect(verifiedRecordingViews(check, 'current')).toBe(123456)
  expect(verifiedRecordingViews(check, 'replaced')).toBeNull()
  expect(verifiedRecordingViews({ ...check, metricsVerified: undefined }, 'current')).toBeNull()
  expect(verifiedRecordingViews({ ...check, metricsVerified: { totalViews: true } }, 'current')).toBeNull()
  expect(verifiedRecordingViews({ ...check, metrics: { ...check.metrics!, totalViewsExact: false } }, 'current')).toBeNull()
  expect(verifiedRecordingViews({ ...check, metrics: { ...check.metrics!, totalViews: 3_000_000_000 } }, 'current')).toBeNull()
})

test('accepts an established top payout tier while preserving uncertainty in hidden countries', () => {
  const result = assessAudience([country('US', 'United States', 60), country('BR', 'Brazil', 10)], terms)
  expect(result).toEqual({ percent: 60, minimumPercent: 59.95, maximumPercent: 90.05, stable: true })
})

test('requires manual review when Other or rounding could change a payout or bonus', () => {
  expect(assessAudience([country('DE', 'Germany', 22.9), country('BR', 'Brazil', 10)], terms).stable).toBe(false)
  expect(stableAudiencePayout(terms, 44.9, 45.1)).toBe(false)
  expect(stableAudiencePayout(terms, 29.95, 30.05)).toBe(false)
})

test('displayed-country policy accepts independently verified named shares without allocating Other', () => {
  const countries = [country('US', 'United States', 18.7), country('BR', 'Brazil', 20)]
  const check: AudienceCheck = { version: 1, basis: 'displayed_countries', storageKey: 'current', status: 'verified',
    countries, otherPercent: 61.3, percent: 18.7, minimumPercent: 18.65, maximumPercent: 80.05 }
  expect(audienceReviewError(check, 'current', 'current', 18.7, false, terms)).toBeNull()
  expect(audienceReviewError({ ...check, basis: undefined }, 'current', 'current', 18.7, false, terms)).not.toBeNull()
  expect(audienceReviewError({ ...check, percent: 20 }, 'current', 'current', 20, false, terms)).not.toBeNull()
  expect(audienceReviewError({ ...check, countries: [] }, 'current', 'current', 18.7, false, terms)).not.toBeNull()
})

test('rejects duplicate, mismatched and impossible country lists instead of summing them', () => {
  expect(() => assessAudience([country('US', 'United States', 60), country('US', 'United States', 60)], terms)).toThrow()
  expect(() => assessAudience([country('US', 'Brazil', 60)], terms)).toThrow()
  expect(() => assessAudience([country('US', 'United States', 60), country('BR', 'Brazil', 40.2)], terms)).toThrow()
})

test('omitted rows cannot pass verification when named countries and Other fail to reconcile', () => {
  const partial = [country('US', 'United States', 18.5), country('BR', 'Brazil', 13.7)]
  expect(audienceListTotalConsistent(partial, 60.5)).toBe(false)
  expect(audienceListTotalConsistent([country('US', 'United States', 23), country('BR', 'Brazil', 16.1)], 60.5)).toBe(true)
  const check: AudienceCheck = { version: 1, basis: 'displayed_countries', storageKey: 'current', status: 'verified', countries: partial, percent: 18.5, otherPercent: 60.5 }
  expect(audienceReviewError(check, 'current', 'current', 18.5, false, terms)).not.toBeNull()
})

test('approval requires current verified evidence or explicit manual confirmation', () => {
  const check: AudienceCheck = { version: 1, storageKey: 'current', status: 'verified', percent: 60, minimumPercent: 59.9, maximumPercent: 90 }
  expect(audienceReviewError(check, 'current', 'current', 60, false, terms)).toBeNull()
  expect(audienceReviewError(check, 'current', 'current', 80, false, terms)).not.toBeNull()
  expect(audienceReviewError(null, 'current', 'current', 60, false, terms)).not.toBeNull()
  expect(audienceReviewError(null, 'current', 'current', 60, true, terms)).toBeNull()
  expect(audienceReviewError(check, 'new', 'current', 60, true, terms)).not.toBeNull()
})
