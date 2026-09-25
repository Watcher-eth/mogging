/**
 * Illustrative score distribution, NOT an observed population percentile.
 * Assume Normal(mean=5, standard deviation=1.5) on the display-score scale.
 * About 75% fall at or below 6. Keep the estimate labeled in the graphic.
 */
export function estimatedPopulationTopPercent(score: number): number | null {
  if (!Number.isFinite(score) || score < 5 || score > 10) return null
  const z = (score - 5) / 1.5
  // Standard-normal survival function (error < 7.5e-8).
  const t = 1 / (1 + 0.2316419 * z)
  const tail = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI) * t *
    (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return Math.max(0.1, Math.round(tail * 1000) / 10)
}
