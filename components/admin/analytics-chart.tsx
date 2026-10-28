import dynamic from 'next/dynamic'
import { useMemo } from 'react'
import type { MetricRow } from '@/lib/admin/analytics'
import { dailyPoints } from '@/lib/admin/chart-data'
import { ADMIN_REPORTING_TIME_ZONE } from '@/lib/admin/reporting-time'
import { Bars, count, money } from './analytics-ui'

const Liveline = dynamic(() => import('liveline').then(module => module.Liveline), {
  ssr: false, loading: () => <div className="admin-chart-loading" role="status">Loading chart…</div>,
})
export type ChartMetric = { key: string; label: string; color: string }
export const chartColors = { blue: '#00A8EF', violet: '#9b83e5', green: '#40a88a', orange: '#db9474', ink: '#52565c' }

export function AnalyticsChart({ rows, metrics, days, currency, title, fitToData = false, timeZone = ADMIN_REPORTING_TIME_ZONE, granularity, presentation = 'standard', valueFormatter }: { rows: MetricRow[]; metrics: ChartMetric[]; days: number; currency?: string; title: string; fitToData?: boolean; timeZone?: string; granularity?: "hourly" | "daily"; presentation?: "standard" | "inline"; valueFormatter?: (value: number) => string }) {
  const series = useMemo(() => metrics.map(metric => {
    const data = dailyPoints(rows, metric.key)
    return { id: metric.key, label: metric.label, color: metric.color, data, value: data.at(-1)?.value ?? 0 }
  }), [rows, metrics])
  const firstTime = Math.min(...series.map(item => item.data[0]?.time ?? Infinity))
  const windowSeconds = useMemo(() => {
    if (!fitToData || !Number.isFinite(firstTime)) return days * 86400
    // Liveline reserves 1.5% of its window beyond now when badges are hidden.
    // Fit the first observation to its left edge rather than clipping that point.
    return Math.max(1, (Date.now() / 1000 - firstTime) / 0.985 + 60)
  }, [fitToData, firstTime, days])
  const interval = granularity ?? (days === 1 ? "hourly" : "daily")
  const formatTime = (time: number) => new Date(time * 1000).toLocaleString("en-US", { month: "short", day: "numeric", ...(interval === "hourly" ? { hour: "2-digit" as const, minute: "2-digit" as const, hour12: false, timeZoneName: "short" as const } : {}), timeZone })
  const hasData = series.some(item => item.data.length > 0)
  if (!hasData) return <p className="admin-chart-empty">No {interval} observations for this window.</p>
  if (!series.some(item => item.data.length > 1)) return <div className={presentation === 'inline' ? undefined : "py-5"}><Bars presentation={presentation} color={presentation === 'inline' ? series[0]?.color : undefined} rows={series.map(item => ({ label: item.label, value: item.data[0]?.value ?? null, detail: item.data[0] ? formatTime(item.data[0].time) : undefined }))} format={valueFormatter ?? (value => currency ? money(value, currency) : count(value))} />{presentation === 'standard' ? <p className="mt-4 text-xs text-[#858a91]">One recorded bucket. A trend needs at least two {interval} observations.</p> : null}</div>
  // Liveline is a time-series chart: categories and cohorts use bars instead.
  // Pause the snapshot so historical daily data does not scroll like a live feed.
  return <div className="admin-chart" role="group" aria-label={`${title}. ${interval} ${timeZone} observations${presentation === 'inline' ? '.' : '; exact values are available in the underlying data.'}`}>
    <Liveline key={`${days}:${interval}:${timeZone}:${currency ?? ''}:${firstTime}:${metrics.map(metric => metric.key).join(',')}`} data={series[0].data} value={series[0].value} series={series.length > 1 ? series : undefined}
      color={series[0].color} theme="light" window={windowSeconds} paused pulse={false} momentum={false} badge={false}
      fill={series.length === 1} grid scrub lineWidth={2} padding={{ top: presentation === 'inline' ? 12 : 20, bottom: presentation === 'inline' ? 28 : 38, left: fitToData ? 0 : 12, right: presentation === 'inline' ? 38 : 58 }}
      formatValue={valueFormatter ?? (value => currency ? money(value, currency) : count(value))}
      formatTime={formatTime} />
  </div>
}
