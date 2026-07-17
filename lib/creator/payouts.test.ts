import { describe, expect, test } from 'bun:test'
import { calculateCreatorPayout } from './payouts'

describe('calculateCreatorPayout', () => {
  test.each([
    [40_000, 22.5, 23, 2.5390625],
    [100_000, 22.5, 30, 1.3390625],
    [250_000, 22.5, 39, 0.6890625],
    [500_000, 30, 113, 0.75625],
    [750_000, 40, 259, 0.8625],
    [1_000_000, 40, 325, 0.8125],
  ])('calculates %i views at %s%% audience', (views, audience, payout, usCpm) => {
    const result = calculateCreatorPayout(views, true, audience)

    expect(result.payout).toBe(payout)
    expect(result.usCpm).toBe(usCpm)
  })

  test.each([[40_000, 20], [100_000, 26], [250_000, 33], [500_000, 60], [750_000, 83], [1_000_000, 100]])('uses the base ladder for %i views when combined Tier-1 audience is eligible', (views, payout) => {
    const result = calculateCreatorPayout(views, true, null)

    expect(result.payout).toBe(payout)
    expect(result.hasUsRateBoost).toBe(false)
  })

  test('returns no payout below 20% combined Tier-1 audience', () => {
    const result = calculateCreatorPayout(500_000, false, null)

    expect(result.payout).toBe(0)
    expect(result.isEligible).toBe(false)
  })

  test('caps audience at 40% and payout at $325', () => {
    const result = calculateCreatorPayout(1_000_000, true, 50)

    expect(result.audiencePercentage).toBe(40)
    expect(result.payout).toBe(325)
    expect(result.isCapped).toBe(true)
  })
})
