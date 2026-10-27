import type { CreatorConversionMetrics } from '@/lib/creator/conversion-report'
export const supportChartMetrics = [
  { key: 'linkPresses', label: 'Link presses', color: '#00A8EF' },
  { key: 'downloads', label: 'Downloads', color: '#9b83e5' },
  { key: 'conversions', label: 'Conversions', color: '#40a88a' },
  { key: 'revenue', label: 'Attributed revenue', color: '#db9474' },
] as const
export type SupportChartMetric = typeof supportChartMetrics[number]
export type SupportChartKey = SupportChartMetric['key']
export const chartCount = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format
export const chartMoney = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
export function chartMetricRows(totals: CreatorConversionMetrics) {
  const maximum = Math.max(0, totals.linkPresses, totals.downloads, totals.conversions)
  return supportChartMetrics.map(metric => {
    const value = metric.key === 'revenue' ? totals.revenueCents / 100 : totals[metric.key]
    return { ...metric, value, formatted: metric.key === 'revenue' ? chartMoney(value) : chartCount(value), fraction: metric.key === 'revenue' ? (value === 0 ? 0 : 1) : maximum > 0 ? Math.max(0,value) / maximum : 0 }
  })
}
