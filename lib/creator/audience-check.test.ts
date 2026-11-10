import { expect, test } from 'bun:test'
import { assessAudience, audienceReviewError, stableAudiencePayout, type AudienceCheck, type AudienceCountry } from './audience-check'
import { defaultCreatorSprintTerms } from './sprint-defaults'

const terms = defaultCreatorSprintTerms()
const country = (code: string, name: string, percent: number): AudienceCountry => ({ code, name, percent, precision: 1, frameIds: ['tail-1', 'tail-2'] })

test('accepts an established top payout tier while preserving uncertainty in hidden countries', () => {
  const result = assessAudience([country('US', 'United States', 60), country('BR', 'Brazil', 10)], terms)
  expect(result).toEqual({ percent: 60, minimumPercent: 59.95, maximumPercent: 90.05, stable: true })
})

test('requires manual review when Other or rounding could change a payout or bonus', () => {
  expect(assessAudience([country('DE', 'Germany', 22.9), country('BR', 'Brazil', 10)], terms).stable).toBe(false)
  expect(stableAudiencePayout(terms, 44.9, 45.1)).toBe(false)
  expect(stableAudiencePayout(terms, 29.95, 30.05)).toBe(false)
})

test('rejects duplicate, mismatched and impossible country lists instead of summing them', () => {
  expect(() => assessAudience([country('US', 'United States', 60), country('US', 'United States', 60)], terms)).toThrow()
  expect(() => assessAudience([country('US', 'Brazil', 60)], terms)).toThrow()
  expect(() => assessAudience([country('US', 'United States', 60), country('BR', 'Brazil', 40.2)], terms)).toThrow()
})

test('approval requires current verified evidence or explicit manual confirmation', () => {
  const check: AudienceCheck = { version: 1, storageKey: 'current', status: 'verified', percent: 60, minimumPercent: 59.9, maximumPercent: 90 }
  expect(audienceReviewError(check, 'current', 'current', 60, false, terms)).toBeNull()
  expect(audienceReviewError(check, 'current', 'current', 80, false, terms)).not.toBeNull()
  expect(audienceReviewError(null, 'current', 'current', 60, false, terms)).not.toBeNull()
  expect(audienceReviewError(null, 'current', 'current', 60, true, terms)).toBeNull()
  expect(audienceReviewError(check, 'new', 'current', 60, true, terms)).not.toBeNull()
})
