import { CREATOR_TIER_ONE_COUNTRIES } from '@/lib/creator/audience'
import type { DailyDriverReport, DriverDay, DriverMix, DriverTier } from './creator-daily-drivers'

const countryNames = new Intl.DisplayNames('en', { type: 'region' })
const tierOne = new Set<string>(CREATOR_TIER_ONE_COUNTRIES)
export const countryName = (code: string) => countryNames.of(code) ?? code
const ratio = (amount: number, total: number) => total > 0 ? amount / total : null
export const paywallRate = (day: DriverDay) => ratio(day.paidAfterPaywall, day.paywallAccounts)

export function dailyViewMix(mix: DriverMix[]) {
  const campaigns = new Map<string, number>(), countries = new Map<string, number>()
  let total = 0, named = 0, tierOneViews = 0
  for (const row of mix) {
    if (row.country) {
      countries.set(row.country, (countries.get(row.country) ?? 0) + row.views)
      named += row.views
      if (tierOne.has(countryName(row.country))) tierOneViews += row.views
    } else {
      campaigns.set(row.campaign, (campaigns.get(row.campaign) ?? 0) + row.views)
      total += row.views
    }
  }
  return { campaigns, countries, total, named, unknown: Math.max(0, total - named),
    namedShare: ratio(named, total), tierOneShare: named > 0 ? ratio(tierOneViews, named) : null }
}

export function summarizeApprovedAudience(rows: DriverTier[]) {
  const groups = new Map<string, { campaign: string; tier: string; views: number; weighted: number; approvedViews: number }>()
  for (const row of rows) {
    const key = JSON.stringify([row.campaign, row.tier])
    const group = groups.get(key) ?? { campaign: row.campaign, tier: row.tier, views: 0, weighted: 0, approvedViews: 0 }
    group.views += row.views
    if (row.approvedPercent != null) {
      group.weighted += row.approvedPercent * row.views
      group.approvedViews += row.views
    }
    groups.set(key, group)
  }
  return [...groups.values()].map(group => ({ ...group, tierOnePercent: ratio(group.weighted, group.approvedViews) }))
}

function ranks(values: number[]) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value)
  const result = Array<number>(values.length)
  for (let first = 0; first < order.length;) {
    let end = first + 1
    while (end < order.length && order[end].value === order[first].value) end++
    for (let i = first; i < end; i++) result[order[i].index] = (first + end - 1) / 2
    first = end
  }
  return result
}

export function rankCorrelation(pairs: Array<[number, number]>) {
  const days = pairs.length
  if (days < 10) return { rho: null, days }
  const x = ranks(pairs.map(pair => pair[0])), y = ranks(pairs.map(pair => pair[1])), mean = (days - 1) / 2
  let xy = 0, xx = 0, yy = 0
  for (let i = 0; i < days; i++) {
    const a = x[i] - mean, b = y[i] - mean
    xy += a * b; xx += a * a; yy += b * b
  }
  return { rho: xx && yy ? xy / Math.sqrt(xx * yy) : null, days }
}

export function creatorRevenueAssociations({ daily, mix, tiers }: DailyDriverReport, outcome: 'revenue' | 'paidSubscriptions' = 'revenue') {
  const estimatedRows = new Map<string, DriverMix[]>(), totals = new Map<string, number>(), namedTotals = new Map<string, number>()
  for (const row of mix) if (row.basis === 'estimated') {
    const entries = estimatedRows.get(row.day) ?? []
    entries.push(row)
    estimatedRows.set(row.day, entries)
    if (row.country) namedTotals.set(row.country, (namedTotals.get(row.country) ?? 0) + row.views)
    else totals.set(row.campaign, (totals.get(row.campaign) ?? 0) + row.views)
  }
  const estimates = new Map([...estimatedRows].map(([day, rows]) => [day, dailyViewMix(rows)]))
  const approved = new Map<string, { views: number; weighted: number }>()
  for (const row of tiers ?? []) if (row.basis === 'estimated' && row.approvedPercent != null) {
    const total = approved.get(row.day) ?? { views: 0, weighted: 0 }
    total.views += row.views
    total.weighted += row.views * row.approvedPercent
    approved.set(row.day, total)
  }
  const metrics: Array<[string, (day: DriverDay) => number | null]> = [
    ['New submissions', day => day.submissions],
    ['Estimated daily views', day => day.estimatedViews], ['Measured views gained', day => day.measuredViews], ['Creator link clicks', day => day.clicks],
    ['iOS first opens', day => day.firstOpens], ['Signed-in iOS paywall accounts', day => day.paywallAccounts],
    ['Matched iOS paywall purchase rate', paywallRate], ['Tier 1 share of named estimated audience', day => estimates.get(day.day)?.tierOneShare ?? null],
    ['Approved Tier 1 audience share, weighted by estimated views', day => {
      const data = approved.get(day.day)
      return data ? ratio(data.weighted, data.views) : null
    }],
    ...[...namedTotals].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code]): [string, (day: DriverDay) => number | null] => [
      `${countryName(code)} share of named audience`, day => {
        const estimate = estimates.get(day.day)
        return estimate ? ratio(estimate.countries.get(code) ?? 0, estimate.named) : null
      },
    ]),
    ...[...totals].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([campaign]): [string, (day: DriverDay) => number | null] => [
      `${campaign} share of estimated daily views`, day => ratio(estimates.get(day.day)?.campaigns.get(campaign) ?? 0, day.estimatedViews ?? 0),
    ]),
  ]
  return metrics.map(([label, value]) => {
    const values = daily.map(value)
    const outcomeValue = (day: DriverDay | undefined) => day && !(outcome === 'revenue' && day.missingUsd) ? day[outcome] : null
    const compare = (lag: number, changes = false) => rankCorrelation(daily.flatMap((day, i): Array<[number, number]> => {
      const y = outcomeValue(day), x = values[i - lag]
      if (x == null || y == null) return []
      if (!changes) return [[x, y]]
      const before = outcomeValue(daily[i - 1]), previous = values[i - lag - 1]
      return before == null || previous == null ? [] : [[x - previous, y - before]]
    }))
    return { label, sameDay: compare(0), nextDay: compare(1), twoDays: compare(2), changes: compare(0, true) }
  })
}
