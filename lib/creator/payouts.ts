export const CREATOR_VIEW_THRESHOLDS = [
  { views: 40_000, label: '40K', basePayout: 20, baseUsCpm: 2.5 },
  { views: 100_000, label: '100K', basePayout: 26, baseUsCpm: 1.3 },
  { views: 250_000, label: '250K', basePayout: 33, baseUsCpm: 0.65 },
  { views: 500_000, label: '500K', basePayout: 60, baseUsCpm: 0.6 },
  { views: 750_000, label: '750K', basePayout: 83, baseUsCpm: 0.55 },
  { views: 1_000_000, label: '+1M', basePayout: 100, baseUsCpm: 0.5 },
] as const

export const CREATOR_US_AUDIENCE_TIERS = [22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40] as const

const CPM_INCREASE_PER_TIER = 0.0390625
const US_RATE_BOOST_START_PERCENT = 22.5
const MAXIMUM_PAYABLE_AUDIENCE_PERCENT = 40
const MAXIMUM_PAYOUT_DOLLARS = 325

export function isCreatorViewThreshold(value: number): value is (typeof CREATOR_VIEW_THRESHOLDS)[number]['views'] {
  return CREATOR_VIEW_THRESHOLDS.some((option) => option.views === value)
}

export function isCreatorUsAudienceTier(value: number): value is (typeof CREATOR_US_AUDIENCE_TIERS)[number] {
  return CREATOR_US_AUDIENCE_TIERS.some((percentage) => percentage === value)
}

export function calculateCreatorPayout(totalViews: number, tier1AudienceEligible: boolean, usAudiencePercentage: number | null) {
  const threshold = CREATOR_VIEW_THRESHOLDS.find((option) => option.views === totalViews)

  if (!threshold) {
    throw new Error('Unsupported creator view threshold')
  }

  if (!tier1AudienceEligible) {
    return {
      totalViews,
      audiencePercentage: null,
      estimatedUsViews: null,
      usCpm: null,
      unroundedPayout: 0,
      payout: 0,
      isEligible: false,
      hasUsRateBoost: false,
      isCapped: false,
    }
  }

  const hasUsRateBoost = usAudiencePercentage !== null && usAudiencePercentage >= US_RATE_BOOST_START_PERCENT

  if (!hasUsRateBoost) {
    return {
      totalViews,
      audiencePercentage: null,
      estimatedUsViews: null,
      usCpm: null,
      unroundedPayout: threshold.basePayout,
      payout: threshold.basePayout,
      isEligible: true,
      hasUsRateBoost: false,
      isCapped: false,
    }
  }

  const audiencePercentage = Math.min(usAudiencePercentage, MAXIMUM_PAYABLE_AUDIENCE_PERCENT)
  const audienceTierSteps = (audiencePercentage - 20) / 2.5
  const usCpm = threshold.baseUsCpm + audienceTierSteps * CPM_INCREASE_PER_TIER
  const estimatedUsViews = totalViews * (audiencePercentage / 100)
  const unroundedPayout = estimatedUsViews / 1_000 * usCpm
  const cappedPayout = Math.min(unroundedPayout, MAXIMUM_PAYOUT_DOLLARS)

  return {
    totalViews,
    audiencePercentage,
    estimatedUsViews,
    usCpm,
    unroundedPayout,
    payout: Math.round(cappedPayout),
    isEligible: true,
    hasUsRateBoost: true,
    isCapped: unroundedPayout >= MAXIMUM_PAYOUT_DOLLARS,
  }
}
