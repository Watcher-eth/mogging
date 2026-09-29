export const scoreRanges = {
  low: { label: 'Low · 1–2.5', min: 1, max: 2.5 },
  'medium-low': { label: 'Medium low · 2.5–5', min: 2.5, max: 5 },
  'medium-high': { label: 'Medium high · 5–7', min: 5, max: 7 },
  high: { label: 'High · 7–9', min: 7, max: 9 },
} as const
export type ScoreRange = keyof typeof scoreRanges

export function randomScore(range: ScoreRange, maximum = 10) {
  const { min, max } = scoreRanges[range]
  const lower = Math.ceil(Math.min(min, maximum) * 10)
  const upper = Math.floor(Math.min(max, maximum) * 10)
  return ((lower + Math.floor(Math.random() * (upper - lower + 1))) / 10).toFixed(1)
}

export function randomScorePair(range: ScoreRange) {
  const scores = [randomScore(range), randomScore(range)].sort((a, b) => Number(a) - Number(b))
  return { current: scores[0], potential: scores[1] }
}
