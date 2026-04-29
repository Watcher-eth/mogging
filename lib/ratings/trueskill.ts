export const RATING_ALGORITHM = 'trueskill_v1'

const INITIAL_MU = 25
const INITIAL_SIGMA = INITIAL_MU / 3
const BETA = INITIAL_MU / 6
const DYNAMICS_FACTOR = INITIAL_MU / 300
const CONSERVATIVE_SIGMA_MULTIPLIER = 3
const DISPLAY_RATING_BASE = 1000
const DISPLAY_RATING_SCALE = 40

export type SkillRating = {
  mu: number
  sigma: number
}

export type RatingUpdate = {
  winner: SkillRating
  loser: SkillRating
}

export function initialSkillRating(): SkillRating {
  return {
    mu: INITIAL_MU,
    sigma: INITIAL_SIGMA,
  }
}

export function conservativeScore(rating: SkillRating) {
  return rating.mu - CONSERVATIVE_SIGMA_MULTIPLIER * rating.sigma
}

export function displayRating(rating: SkillRating) {
  return Math.max(1, Math.round(DISPLAY_RATING_BASE + (conservativeScore(rating) - 0) * DISPLAY_RATING_SCALE))
}

export function updateRatingsForWin(winner: SkillRating, loser: SkillRating): RatingUpdate {
  const winnerSigma = addDynamics(winner.sigma)
  const loserSigma = addDynamics(loser.sigma)
  const variance = 2 * BETA ** 2 + winnerSigma ** 2 + loserSigma ** 2
  const c = Math.sqrt(variance)
  const t = (winner.mu - loser.mu) / c
  const v = vExceedsMargin(t)
  const w = wExceedsMargin(t, v)

  const winnerMeanMultiplier = winnerSigma ** 2 / c
  const loserMeanMultiplier = loserSigma ** 2 / c
  const winnerVarianceMultiplier = winnerSigma ** 2 / variance
  const loserVarianceMultiplier = loserSigma ** 2 / variance

  return {
    winner: {
      mu: winner.mu + winnerMeanMultiplier * v,
      sigma: Math.sqrt(Math.max(0.0001, winnerSigma ** 2 * (1 - winnerVarianceMultiplier * w))),
    },
    loser: {
      mu: loser.mu - loserMeanMultiplier * v,
      sigma: Math.sqrt(Math.max(0.0001, loserSigma ** 2 * (1 - loserVarianceMultiplier * w))),
    },
  }
}

function addDynamics(sigma: number) {
  return Math.sqrt(sigma ** 2 + DYNAMICS_FACTOR ** 2)
}

function vExceedsMargin(t: number) {
  return normalPdf(t) / Math.max(normalCdf(t), 1e-12)
}

function wExceedsMargin(t: number, v: number) {
  return v * (v + t)
}

function normalPdf(x: number) {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
}

function normalCdf(x: number) {
  return 0.5 * (1 + erf(x / Math.SQRT2))
}

function erf(x: number) {
  const sign = x < 0 ? -1 : 1
  const value = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * value)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-value * value)

  return sign * y
}

