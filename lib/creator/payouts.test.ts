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
  ])('calculates %i views at %s%% audience', (views, audience, payout, tier1Cpm) => {
    const result = calculateCreatorPayout(views, true, audience)

    expect(result.payout).toBe(payout)
    expect(result.tier1Cpm).toBe(tier1Cpm)
  })

  test.each([[20_000, 10], [40_000, 20], [100_000, 26], [250_000, 33], [500_000, 60], [750_000, 83], [1_000_000, 100]])('uses the base ladder for %i views when combined Tier-1 audience is eligible', (views, payout) => {
    const result = calculateCreatorPayout(views, true, null)

    expect(result.payout).toBe(payout)
    expect(result.hasTier1RateBoost).toBe(false)
  })

  test.each([
    [20, 10, 10],
    [22.5, 10.625, 11],
    [25, 11.25, 11],
    [27.5, 11.875, 12],
    [30, 12.5, 13],
    [32.5, 13.125, 13],
    [35, 13.75, 14],
    [37.5, 14.375, 14],
    [40, 15, 15],
  ])('pays the 20K tier at %s%% Tier 1 audience', (audience, unroundedPayout, payout) => {
    const result = calculateCreatorPayout(20_000, true, audience)
    expect(result.unroundedPayout).toBe(unroundedPayout)
    expect(result.payout).toBe(payout)
  })

  test('caps the 20K tier at $15 and requires Tier 1 eligibility', () => {
    expect(calculateCreatorPayout(20_000, true, 50)).toMatchObject({ payout: 15, audiencePercentage: 40, isCapped: true })
    expect(calculateCreatorPayout(20_000, false, 40)).toMatchObject({ payout: 0, isEligible: false })
  })

  test('40K is capped at $35 while lower audience rates and other milestones remain intact', () => {
    expect(calculateCreatorPayout(40_000, true, 40)).toMatchObject({ payout: 35, isCapped: true });
    expect(calculateCreatorPayout(40_000, true, 30).payout).toBe(32);
    expect(calculateCreatorPayout(100_000, true, 40).payout).toBe(65);
  });

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
