import type { CreatorConversionReport } from '../conversion-report'
/** Recompute every displayed total from the same UTC window as the chart. */
export function supportAnalyticsWindow(report: Pick<CreatorConversionReport, 'daily'>, days: number, now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  const byDay = new Map(report.daily.map(row => [row.day, row]))
  const daily = Array.from({ length: days }, (_, index) => {
    const day = new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10)
    return byDay.get(day) ?? { day, linkPresses: 0, downloads: 0, conversions: 0, revenue: 0 }
  })
  const totals = daily.reduce((sum, row) => ({ linkPresses: sum.linkPresses + row.linkPresses, downloads: sum.downloads + row.downloads, conversions: sum.conversions + row.conversions, revenueCents: sum.revenueCents + Math.round(row.revenue * 100) }), { linkPresses: 0, downloads: 0, conversions: 0, revenueCents: 0 })
  return { daily, totals }
}
