import type { MetricRow } from './analytics'
import { landingExperiments } from '../analytics/landing'

// Historical tests used 97.5%; the single active comparison uses 95%.
export function landingRateInterval(successes: number, trials: number, z = 2.241402728): [number, number] | null {
  if (trials <= 0) return null
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
    const interval = landingRateInterval(matureClicks, mature, experiment.status === 'active' ? 1.959963985 : 2.241402728)
    return {
      variant: `${variant.toUpperCase()} · ${variant === 'a' ? experiment.control : experiment.treatment}`,
      visitors, store_clicks: Number(row?.store_clicks ?? 0),
      observed_store_rate: visitors ? `${(Number(row?.store_clicks ?? 0) / visitors * 100).toFixed(1)}%` : '—',
      mature, pending: Number(row?.pending ?? 0),
      mature_store_rate: mature ? `${(matureClicks / mature * 100).toFixed(1)}%` : '—',
      mature_store_clicks: matureClicks,
      first_exposure: row?.first_exposure ?? null,
      interval: interval ? `${interval[0].toFixed(1)}–${interval[1].toFixed(1)}%` : '—',
      browser_starts: Number(row?.web_starts ?? 0), paywalls: Number(row?.paywalls ?? 0),
      checkouts: Number(row?.checkouts ?? 0), paid_checkouts: Number(row?.paid_checkouts ?? 0),
    }
  })
}

export function landingExperimentSummary(rows: MetricRow[], experimentId: string, now: Date) {
  const experiment = landingExperiments.find(item => item.id === experimentId)!
  const variants = landingExperimentRows(rows, experimentId)
  const [a, b] = variants
  const total = Number(a.visitors) + Number(b.visitors)
  const imbalance = total >= 100 && (Number(a.visitors) - Number(b.visitors)) ** 2 / total > 10.827566171
  const exposures = variants.map(row => typeof row.first_exposure === 'string' ? Date.parse(row.first_exposure) : NaN).filter(Number.isFinite)
  const elapsedDays = exposures.length ? Math.max(0, Math.floor((now.getTime() - Math.min(...exposures)) / 86400_000)) : 0
  const enough = variants.every(row => Number(row.mature) >= experiment.minimumVisitors) && elapsedDays >= experiment.minimumDays
  const rateA = Number(a.mature) ? Number(a.mature_store_clicks) / Number(a.mature) : null
  const rateB = Number(b.mature) ? Number(b.mature_store_clicks) / Number(b.mature) : null
  return { total, imbalance, elapsedDays,
    status: experiment.status === 'archived' ? 'Archived' : !total ? 'Awaiting first exposure' : imbalance ? 'Check traffic allocation' : enough ? 'Checkpoints met · review uncertainty' : 'Collecting data',
    difference: rateA != null && rateB != null ? `${((rateB - rateA) * 100).toFixed(1)} percentage points` : 'Awaiting mature visitors',
    lift: rateA != null && rateA > 0 && rateB != null ? `${((rateB / rateA - 1) * 100).toFixed(1)}%` : '—',
  }
}
