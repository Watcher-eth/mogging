import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import type { MetricRow } from '@/lib/admin/analytics'
import { dailyPoints } from '@/lib/admin/chart-data'
import { Bars, count, money } from './analytics-ui'

const Liveline = dynamic(() => import('liveline').then(module => module.Liveline), {
  ssr: false, loading: () => <div className="admin-chart-loading" role="status">Loading chart…</div>,
})
export type ChartMetric = { key: string; label: string; color: string }
export const chartColors = { blue: '#00A8EF', violet: '#9b83e5', green: '#40a88a', orange: '#db9474', ink: '#52565c' }

export function AnalyticsChart({ rows, metrics, days, currency, title }: { rows: MetricRow[]; metrics: ChartMetric[]; days: number; currency?: string; title: string }) {
  const series = useMemo(() => metrics.map(metric => {
    const data = dailyPoints(rows, metric.key)
    return { id: metric.key, label: metric.label, color: metric.color, data, value: data.at(-1)?.value ?? 0 }
  }), [rows, metrics])
  const interval = days === 1 ? "hourly" : "daily"
  const formatTime = (time: number) => new Date(time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", ...(days === 1 ? { hour: "2-digit" as const, minute: "2-digit" as const, hour12: false } : {}), timeZone: "UTC" })
  const hasData = series.some(item => item.data.length > 0)
  if (!hasData) return <p className="admin-chart-empty">No {interval} observations for this window.</p>
  if (!series.some(item => item.data.length > 1)) return <div className="py-5"><Bars rows={series.map(item => ({ label: item.label, value: item.data[0]?.value ?? null, detail: item.data[0] ? formatTime(item.data[0].time) : undefined }))} format={value => currency ? money(value, currency) : count(value)} /><p className="mt-4 text-xs text-[#858a91]">One recorded bucket. A trend needs at least two {interval} observations.</p></div>
  // Liveline is a time-series chart: categories and cohorts use bars instead.
  // Pause the snapshot so historical daily data does not scroll like a live feed.
  return <div className="admin-chart" role="group" aria-label={`${title}. ${interval} UTC observations; exact values are available in the underlying data.`}>
    <Liveline data={series[0].data} value={series[0].value} series={series.length > 1 ? series : undefined}
      color={series[0].color} theme="light" window={days * 86400} paused pulse={false} momentum={false} badge={false}
      fill={series.length === 1} grid scrub lineWidth={2} padding={{ top: 20, bottom: 38, left: 12, right: 58 }}
      formatValue={value => currency ? money(value, currency) : count(value)}
      formatTime={formatTime} />
  </div>
}
