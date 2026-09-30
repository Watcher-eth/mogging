export const CREATOR_VIEW_THRESHOLDS = [
  { views: 20_000, label: '20K', basePayout: 10, maxPayout: 15 },
  { views: 40_000, label: '40K', basePayout: 20, baseTier1Cpm: 2.5 },
  { views: 100_000, label: '100K', basePayout: 26, baseTier1Cpm: 1.3 },
  { views: 250_000, label: '250K', basePayout: 33, baseTier1Cpm: 0.65 },
  { views: 500_000, label: '500K', basePayout: 60, baseTier1Cpm: 0.6 },
  { views: 750_000, label: '750K', basePayout: 83, baseTier1Cpm: 0.55 },
  { views: 1_000_000, label: '+1M', basePayout: 100, baseTier1Cpm: 0.5 },
] as const

export const CREATOR_TIER1_AUDIENCE_TIERS = [22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40] as const

const CPM_INCREASE_PER_TIER = 0.0390625
const TIER1_RATE_BOOST_START_PERCENT = 22.5
const MAXIMUM_PAYABLE_AUDIENCE_PERCENT = 40
const MAXIMUM_PAYOUT_DOLLARS = 325

export function isCreatorViewThreshold(value: number): value is (typeof CREATOR_VIEW_THRESHOLDS)[number]['views'] {
  return CREATOR_VIEW_THRESHOLDS.some((option) => option.views === value)
}

export function isCreatorTier1AudienceTier(value: number): value is (typeof CREATOR_TIER1_AUDIENCE_TIERS)[number] {
  return CREATOR_TIER1_AUDIENCE_TIERS.some((percentage) => percentage === value)
}

export function calculateCreatorPayout(totalViews: number, tier1AudienceEligible: boolean, tier1AudiencePercentage: number | null) {
  const threshold = CREATOR_VIEW_THRESHOLDS.find((option) => option.views === totalViews)

  if (!threshold) {
    throw new Error('Unsupported creator view threshold')
  }

  if (!tier1AudienceEligible) {
    return {
      totalViews,
      audiencePercentage: null,
      estimatedTier1Views: null,
      tier1Cpm: null,
      unroundedPayout: 0,
      payout: 0,
      isEligible: false,
      hasTier1RateBoost: false,
      isCapped: false,
    }
  }

  const hasTier1RateBoost = tier1AudiencePercentage !== null && tier1AudiencePercentage >= TIER1_RATE_BOOST_START_PERCENT

  if (!hasTier1RateBoost) {
    return {
      totalViews,
      audiencePercentage: null,
      estimatedTier1Views: null,
      tier1Cpm: null,
      unroundedPayout: threshold.basePayout,
      payout: threshold.basePayout,
      isEligible: true,
      hasTier1RateBoost: false,
      isCapped: false,
    }
  }

  const audiencePercentage = Math.min(tier1AudiencePercentage, MAXIMUM_PAYABLE_AUDIENCE_PERCENT)
  const audienceTierSteps = (audiencePercentage - 20) / 2.5
  const estimatedTier1Views = totalViews * (audiencePercentage / 100)
  const maximumPayout = 'maxPayout' in threshold ? threshold.maxPayout : MAXIMUM_PAYOUT_DOLLARS
  const unroundedPayout = 'maxPayout' in threshold
    ? threshold.basePayout + (threshold.maxPayout - threshold.basePayout) * (audiencePercentage - 20) / (MAXIMUM_PAYABLE_AUDIENCE_PERCENT - 20)
    : estimatedTier1Views / 1_000 * (threshold.baseTier1Cpm + audienceTierSteps * CPM_INCREASE_PER_TIER)
  const tier1Cpm = 'maxPayout' in threshold
    ? unroundedPayout / estimatedTier1Views * 1_000
    : threshold.baseTier1Cpm + audienceTierSteps * CPM_INCREASE_PER_TIER
  const cappedPayout = Math.min(unroundedPayout, maximumPayout)

  return {
    totalViews,
    audiencePercentage,
    estimatedTier1Views,
    tier1Cpm,
    unroundedPayout,
    payout: Math.round(cappedPayout),
    isEligible: true,
    hasTier1RateBoost: true,
    isCapped: unroundedPayout >= maximumPayout,
  }
}
