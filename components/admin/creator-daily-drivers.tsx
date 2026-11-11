import { useMemo, useState } from 'react'
import { countryName, creatorRevenueAssociations, dailyViewMix, paywallRate, summarizeApprovedAudience } from '@/lib/admin/creator-daily-driver-analysis'
import type { DailyDriverReport } from '@/lib/admin/creator-daily-drivers'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { count, DataDetails, money, Panel, percent, Stat, Table } from './analytics-ui'

const chartSeries = [
  { title: 'Revenue', currency: 'USD', metrics: [{ key: 'revenue', label: 'Revenue', color: chartColors.blue }] },
  { title: 'Paid subscriptions', metrics: [{ key: 'paidSubscriptions', label: 'Paid subscriptions', color: chartColors.green }] },
  { title: 'Estimated views', metrics: [{ key: 'estimatedViews', label: 'Estimated views', color: chartColors.violet }] },
] satisfies { title: string; currency?: string; metrics: ChartMetric[] }[]
const compactCount = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const formatChartCount = (value: number) => compactCount.format(value)
const dayCount = (value: number) => `${value} ${value === 1 ? 'day' : 'days'}`
const viewBases = [
  { value: 'estimated', label: 'Estimated daily views' },
  { value: 'cohort', label: 'Lifetime views on new posts' },
  { value: 'measured', label: 'Measured views gained' },
] as const
const dollars = (value: number) => money(value, 'USD')
const conversion = (value: number | null) => value == null ? '—' : percent(value, 1)
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`
const dailyRevenue = (day: DailyDriverReport['daily'][number]) => `${dollars(day.revenue)}${day.missingUsd ? ' known' : ''}`
const dailyColumns = ['day', 'revenue', 'paid_subscriptions', 'new_submissions', 'estimated_views']

export default function CreatorDailyDrivers({ report }: { report: DailyDriverReport }) {
  const { daily, mix } = report
  const [selectedDay, setSelectedDay] = useState('')
  const [outcome, setOutcome] = useState<'revenue' | 'paidSubscriptions'>('revenue')
  const [basis, setBasis] = useState<typeof viewBases[number]['value']>('estimated')
  const selected = daily.find(row => row.day === selectedDay) ?? daily.at(-1)!
  const associations = useMemo(() => creatorRevenueAssociations(report, outcome), [report, outcome])
  const daysByDate = new Map(daily.map(row => [row.day, row]))
  const recentDays = [...daily].reverse()
  const mainRows = recentDays.map(day => ({ day: shortDay(day.day), revenue: dailyRevenue(day),
    paid_subscriptions: day.paidSubscriptions, new_submissions: day.submissions, estimated_views: day.estimatedViews }))
  const chartRows = daily.map(day => ({ ...day, revenue: day.missingUsd ? null : day.revenue }))
  const rows = mix.filter(row => row.day === selected.day && row.basis === basis)
  const viewMix = dailyViewMix(rows)
  const campaignRows = [...viewMix.campaigns].sort((a, b) => b[1] - a[1])
  const namedCountries = [...viewMix.countries].sort((a, b) => b[1] - a[1])
  const tiers = summarizeApprovedAudience((report.tiers ?? []).filter(row => row.day === selected.day && row.basis === basis))
    .filter(row => row.views > 0).sort((a, b) => a.campaign.localeCompare(b.campaign) || a.tier.localeCompare(b.tier))
  const recordings = report.recordings ?? []
  const ocrCampaigns = new Map<string, { posts: number; viewers: number; views: number; approximate: number }>()
  for (const row of recordings) if (row.verified) {
    const campaign = ocrCampaigns.get(row.campaign) ?? { posts: 0, viewers: 0, views: 0, approximate: 0 }
    campaign.posts++
    campaign.viewers += row.viewers
    campaign.views += row.views
    campaign.approximate += Number(!row.exact)
    ocrCampaigns.set(row.campaign, campaign)
  }
  const countryRows = namedCountries.map(([code, views]) => ({ country: countryName(code), estimated_views: Math.round(views), share_of_views: percent(views, viewMix.total) }))
  if (viewMix.total > 0 && viewMix.unknown > 0) countryRows.push({ country: 'Other / not identified', estimated_views: Math.round(viewMix.unknown), share_of_views: percent(viewMix.unknown, viewMix.total) })
  const estimatedDays = daily.filter(day => day.estimatedViews != null).length
  const measuredDays = daily.filter(day => day.measuredViews != null).length
  const missingUsd = daily.reduce((sum, day) => sum + day.missingUsd, 0)
  const formatAssociation = ({ rho, days }: typeof associations[number]['sameDay']) => rho == null ? `— (${days} days)`
    : `${rho > 0.25 ? 'Rises together' : rho < -0.25 ? 'Moves opposite' : 'Weak link'} · ${rho.toFixed(2)} (${days}d)`
  return <>
    <Panel title="Daily revenue and reach" description={`${shortDay(daily[0].day)} – ${shortDay(daily.at(-1)!.day)} · Last 30 complete Pacific days · All social platforms`}
      note="Revenue is recorded collections after refunds, before fees. Days with incomplete currency conversion show the known amount in the table and are left blank in the chart. Paid subscriptions count each provider subscription’s first recorded positive payment, including paid trial conversions; later renewals and one-time sales do not add another subscription. Estimated views spread growth between dated view counts across the intervening days. The model stops at the last recorded count. Measured views use exact snapshots of the same post and source, 18–30 hours apart. Paywall conversion is the share of signed-in iOS paywall accounts that made a matching purchase later that day.">
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title={missingUsd ? 'Known revenue' : 'Revenue'} value={dollars(daily.reduce((sum, day) => sum + day.revenue, 0))} note="All channels · after refunds, before fees" />
        <Stat title="Paid subscriptions" value={count(daily.reduce((sum, day) => sum + day.paidSubscriptions, 0))} note="First recorded payment per subscription" />
        <Stat title="Estimated views" value={estimatedDays ? count(daily.reduce((sum, day) => sum + (day.estimatedViews ?? 0), 0)) : '—'} note={`Estimated on ${dayCount(estimatedDays)} · measured on ${dayCount(measuredDays)}`} />
        <Stat title="iOS paywall conversion" value={percent(daily.reduce((sum, day) => sum + day.paidAfterPaywall, 0), daily.reduce((sum, day) => sum + day.paywallAccounts, 0))} note="Same-day purchase rate among signed-in paywall accounts" />
      </div>
      <div className="mb-5 grid min-w-0 gap-4 md:grid-cols-3 [&_.admin-chart]:h-[170px] [&_.admin-chart-loading]:min-h-[170px] [&_.admin-chart-empty]:min-h-[170px]">
        {chartSeries.map(chart => <div key={chart.title} className="min-w-0"><h3 className="text-sm font-medium">{chart.title}</h3>
          <AnalyticsChart {...chart} rows={chartRows} days={daily.length} granularity="daily" timeZone="UTC" dateFormat="day-month" presentation="inline" fitToData rangeStart={daily[0].day} valueFormatter={chart.currency ? undefined : formatChartCount} />
        </div>)}
      </div>
      <p className="mb-3 text-xs leading-5 text-zinc-600"><strong>New submissions</strong> are posts first submitted that day. <strong>Estimated views</strong> are views likely gained that day across new and older posts.</p>
      <Table columns={dailyColumns} rows={mainRows.slice(0, 7)} />
      <DataDetails title="See all dates and measurement details">
        <Table columns={dailyColumns} rows={mainRows} />
        <p className="mb-2 mt-5 text-xs leading-5 text-zinc-600"><strong>Posts in estimate</strong> are the new and older posts that supplied a view estimate for that day. <strong>Lifetime views on new posts</strong> are all views reported so far on posts first submitted that day, including views from later dates.</p>
        <Table columns={['day','posts_in_estimate','lifetime_views_on_new_posts','measured_views','posts_with_measured_views']} rows={recentDays.map(day => ({
          day: shortDay(day.day), posts_in_estimate: day.estimatedPosts, lifetime_views_on_new_posts: day.cohortViews,
          measured_views: day.measuredViews, posts_with_measured_views: day.measuredPosts,
        }))} />
        <h3 className="mb-2 mt-5 text-sm font-medium">Revenue and iOS purchase funnel</h3>
        <Table columns={['day','ios_revenue','web_revenue','ios_renewals','ios_nonrenewal_sales','creator_clicks','ios_first_opens','signed_in_paywall_accounts','matched_purchases','same_day_conversion']} rows={recentDays.map(day => ({
          day: shortDay(day.day), ios_revenue: dollars(day.ios), web_revenue: dollars(day.web), ios_renewals: dollars(day.iosRenewals), ios_nonrenewal_sales: day.iosSales,
          creator_clicks: day.clicks, ios_first_opens: day.firstOpens, signed_in_paywall_accounts: day.paywallAccounts,
          matched_purchases: day.paidAfterPaywall, same_day_conversion: conversion(paywallRate(day)),
        }))} />
      </DataDetails>
    </Panel>
    <Panel title="Campaign and audience mix" description="Compare the selected day’s reach with its revenue and paid subscriptions."
      action={<div className="flex flex-wrap gap-3"><AnalyticsSelect label="Day" value={selected.day} onChange={setSelectedDay} options={[...daily].reverse().map(row => ({ value: row.day, label: shortDay(row.day) }))} /><AnalyticsSelect label="View basis" value={basis} onChange={value => setBasis(viewBases.find(option => option.value === value)?.value ?? 'estimated')} options={[...viewBases]} /></div>}
      note="Country counts are estimates: post views weighted by the named country percentages in verified audience recordings. These recordings reflect cumulative viewer mix, not daily impressions by country. For measured gains, only a recording assessed by the closing observation is eligible. Estimated and cohort views use audience evidence available by the end of this report. Any unlisted or unverified share stays in Other / not identified. Campaigns use current post assignments; these are reach shares, not revenue attribution. Approved tiers use the latest recorded approval as of the report cutoff, so they are retrospective. Approved Tier 1 percentages are weighted by views and never used to infer individual countries.">
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 rounded-lg bg-zinc-50 px-4 py-3 text-sm tabular-nums text-zinc-600">
        <span><strong className="text-zinc-900">{dailyRevenue(selected)}</strong> revenue</span>
        <span><strong className="text-zinc-900">{count(selected.paidSubscriptions)}</strong> paid subscriptions</span>
      </div>
      <p className="mb-4 text-sm text-zinc-600">{viewMix.total ? `${count(viewMix.total)} views · ${conversion(viewMix.namedShare)} covered by named countries` : 'No views available for this day and view basis.'}</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Table columns={['campaign','views','share_of_views']} rows={campaignRows.map(([campaign, views]) => ({ campaign, views, share_of_views: percent(views, viewMix.total) }))} />
        <Table columns={['country','estimated_views','share_of_views']} rows={countryRows} />
      </div>
      <h3 className="mb-3 mt-6 text-sm font-medium">Approved audience tiers</h3>
      <p className="mb-3 text-xs text-zinc-600">{percent(tiers.reduce((sum, row) => sum + row.approvedViews, 0), viewMix.total)} of views have an approved Tier 1 audience percentage. Tier labels follow the applicable campaign rates.</p>
      <Table columns={['campaign','approved_tier','views','share_of_campaign_views','approved_tier_1_share']} rows={tiers.map(row => ({
        campaign: row.campaign, approved_tier: row.tier, views: row.views,
        share_of_campaign_views: percent(row.views, viewMix.campaigns.get(row.campaign) ?? 0),
        approved_tier_1_share: row.tierOnePercent == null ? null : `${row.tierOnePercent.toFixed(1)}%`,
      }))} />
      {namedCountries.length > 0 && <DataDetails><Table columns={['campaign','country','estimated_views','share_of_campaign_views']} rows={campaignRows.flatMap(([campaign, total]) => rows.filter(row => row.campaign === campaign && row.country).sort((a,b) => b.views-a.views).map(row => ({ campaign, country: countryName(row.country!), estimated_views: Math.round(row.views), share_of_campaign_views: percent(row.views, total) })))} /></DataDetails>}
    </Panel>
    <Panel title="Unique viewers vs. total views" description="One recording per post from the last 30 complete Pacific days. Verified pairs are preferred."
      note="The summary uses pairs where both metrics were verified in the same recording. Unverified OCR reads are available below and are excluded from totals and correlations. These are cumulative counts through the recording date, not daily viewers. The campaign totals add each post’s unique viewer count; the same person can appear on multiple posts. Views per viewer uses the sum of views divided by the sum of per-post viewers. Some view counts and ratios are approximate. Recording-day revenue and subscriptions are sitewide context and are not attributed to the post.">
      <Table columns={['campaign','posts_with_both_metrics','sum_of_post_viewers','total_views','views_per_viewer','approximate_view_counts']} rows={[...ocrCampaigns].sort((a, b) => b[1].views - a[1].views).map(([campaign, row]) => ({
        campaign, posts_with_both_metrics: row.posts, sum_of_post_viewers: row.viewers, total_views: row.views,
        views_per_viewer: `${row.approximate ? '≈' : ''}${(row.views / row.viewers).toFixed(2)}×`, approximate_view_counts: row.approximate,
      }))} />
      {recordings.some(row => !row.verified) && <p className="mt-3 text-xs text-zinc-600">{count(recordings.filter(row => !row.verified).length)} unverified OCR pairs are available in the underlying data.</p>}
      {recordings.length > 0 && <DataDetails><Table columns={['recording_day','campaign','post','approved_tier','unique_viewers','total_views','views_per_viewer','day_revenue','day_paid_subscriptions','evidence']} rows={recordings.map(row => {
        const day = daysByDate.get(row.day)
        return { recording_day: shortDay(row.day), campaign: row.campaign, post: row.title, approved_tier: row.tier, unique_viewers: row.viewers,
        total_views: row.exact ? count(row.views) : `≈${count(row.views)}`, views_per_viewer: `${row.exact && row.verified ? '' : '≈'}${(row.views / row.viewers).toFixed(2)}×`,
        day_revenue: day ? dailyRevenue(day) : null,
        day_paid_subscriptions: day?.paidSubscriptions ?? null,
        evidence: row.verified ? 'Both metrics verified' : 'OCR read · unverified' }
      })} /></DataDetails>}
    </Panel>
    <Panel title="What moves with revenue and subscriptions?" description="See which signals rise or fall with the selected outcome. Day-to-day changes help separate short-term movement from the overall trend."
      action={<AnalyticsSelect label="Compare against" value={outcome} onChange={value => setOutcome(value === 'paidSubscriptions' ? 'paidSubscriptions' : 'revenue')} options={[{ value: 'revenue', label: 'Revenue' }, { value: 'paidSubscriptions', label: 'Paid subscriptions' }]} />}
      note="Spearman rank correlation ranges from −1 to +1. At least 10 valid pairs and variation in both series are required; revenue days missing USD conversions are excluded. Next-day and two-days-later columns compare a signal with the selected outcome on a later day. The day-to-day column compares changes from the prior calendar day. The five campaigns and three named countries with the most estimated views are included. Estimated views are reconstructed using later rereviews, so lagged comparisons are retrospective rather than forecasts. Country share uses only the named audience, whose coverage varies. These exploratory comparisons do not establish causation; paywall purchases also contribute directly to revenue.">
      <Table columns={['signal','same_day','next_day','two_days_later','day_to_day_changes']} rows={associations.map(row => ({ signal: row.label, same_day: formatAssociation(row.sameDay), next_day: formatAssociation(row.nextDay), two_days_later: formatAssociation(row.twoDays), day_to_day_changes: formatAssociation(row.changes) }))} />
    </Panel>
  </>
}
