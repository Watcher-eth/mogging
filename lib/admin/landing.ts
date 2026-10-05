import type { MetricRow } from './analytics'
import { landingExperiments } from '../analytics/landing'

// 97.5% per-test intervals account for the two planned primary comparisons.
export function landingRateInterval(successes: number, trials: number): [number, number] | null {
  if (trials <= 0) return null
  const z = 2.241402728
  const p = successes / trials
  const denominator = 1 + z * z / trials
  const center = (p + z * z / (2 * trials)) / denominator
  const margin = z * Math.sqrt(p * (1 - p) / trials + z * z / (4 * trials * trials)) / denominator
  return [Math.max(0, center - margin) * 100, Math.min(1, center + margin) * 100]
}

export function landingExperimentRows(rows: MetricRow[], experimentId: string): MetricRow[] {
  const experiment = landingExperiments.find(experiment => experiment.id === experimentId)!
  return ['a', 'b'].map(variant => {
    const row = rows.find(row => row.experiment_id === experimentId && row.variant === variant)
    const visitors = Number(row?.visitors ?? 0)
    const mature = Number(row?.mature ?? 0)
    const matureClicks = Number(row?.mature_store_clicks ?? 0)
    const interval = landingRateInterval(matureClicks, mature)
    return {
      variant: `${variant.toUpperCase()} · ${variant === 'a' ? experiment.control : experiment.treatment}`,
      visitors, store_clicks: Number(row?.store_clicks ?? 0),
      observed_store_rate: visitors ? `${(Number(row?.store_clicks ?? 0) / visitors * 100).toFixed(1)}%` : '—',
      mature, pending: Number(row?.pending ?? 0),
      mature_store_rate: mature ? `${(matureClicks / mature * 100).toFixed(1)}%` : '—',
      interval: interval ? `${interval[0].toFixed(1)}–${interval[1].toFixed(1)}%` : '—',
      browser_starts: Number(row?.web_starts ?? 0), paywalls: Number(row?.paywalls ?? 0),
      checkouts: Number(row?.checkouts ?? 0), paid_checkouts: Number(row?.paid_checkouts ?? 0),
    }
  })
}
