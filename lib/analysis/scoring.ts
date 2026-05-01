import type { AnalysisProviderResult, MetricCategory } from './schema'

export function computePslScore(
  result: Pick<
    AnalysisProviderResult,
    | 'harmonyScore'
    | 'symmetryScore'
    | 'proportionalityScore'
    | 'averagenessScore'
    | 'dimorphismScore'
    | 'angularityScore'
    | 'metricScores'
    | 'pslScore'
  >
) {
  if (typeof result.pslScore === 'number') {
    return clampPsl(result.pslScore)
  }

  const categoryAverage = (category: MetricCategory, fallback: number) => {
    const scores = result.metricScores.filter((metric) => metric.category === category)
    if (scores.length === 0) return fallback

    return scores.reduce((sum, metric) => sum + metric.score, 0) / scores.length
  }

  const symmetry = typeof result.symmetryScore === 'number'
    ? result.symmetryScore
    : categoryAverage('symmetry', result.harmonyScore)
  const proportionality = typeof result.proportionalityScore === 'number'
    ? result.proportionalityScore
    : categoryAverage('proportionality', result.harmonyScore)
  const averageness = typeof result.averagenessScore === 'number'
    ? result.averagenessScore
    : categoryAverage('averageness', result.harmonyScore)
  const skin = categoryAverage('skin', result.harmonyScore)
  const presentation = categoryAverage('presentation', result.harmonyScore)

  const raw =
    proportionality * 0.22 +
    averageness * 0.2 +
    result.dimorphismScore * 0.18 +
    symmetry * 0.14 +
    result.angularityScore * 0.12 +
    skin * 0.08 +
    presentation * 0.06

  return clampPsl(raw * 0.8)
}

function clampPsl(score: number) {
  return Math.max(0, Math.min(8, Math.round(score * 10) / 10))
}
