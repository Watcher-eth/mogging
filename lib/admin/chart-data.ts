import type { MetricRow } from './analytics'
import { onboardingAnalyticsSteps } from '../analytics/onboarding'

export function onboardingScreenRows(rows: MetricRow[]) {
  const observations = new Map(rows.map(row => [row.step, row]))
  return onboardingAnalyticsSteps.map(([step, screen]): MetricRow => ({
    viewed: 0, continued: 0, pending: 0, mature: 0, dropped: 0, median_ms: null, back_actions: 0,
    ...observations.get(step), step, screen,
  }))
}

export function dailyPoints(rows: MetricRow[], field: string) {
  return rows.flatMap(row => {
    const time = typeof row.day === 'string' ? Date.parse(`${row.day}T00:00:00Z`) / 1000 : NaN
    const raw = row[field]
    const value = raw == null || raw === '' ? NaN : Number(raw)
    return Number.isFinite(time) && Number.isFinite(value) ? [{ time, value }] : []
  }).sort((a, b) => a.time - b.time)
}

export function retentionRates(rows: MetricRow[]) {
  return rows.map(row => ({ label: `Day ${row.day}`, value: Number(row.eligible) > 0 ? Number(row.retained) / Number(row.eligible) * 100 : null,
    detail: `${Number(row.retained).toLocaleString('en-US')} returned / ${Number(row.eligible).toLocaleString('en-US')} eligible accounts` }))
}
