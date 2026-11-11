import { useMemo, useState } from 'react'
import { countryName, creatorRevenueAssociations, dailyViewMix, paywallRate, summarizeApprovedAudience } from '@/lib/admin/creator-daily-driver-analysis'
import type { DailyDriverReport } from '@/lib/admin/creator-daily-drivers'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { count, DataDetails, money, Panel, percent, Stat, Table } from './analytics-ui'

const moneyMetrics: ChartMetric[] = [
  { key: 'revenue', label: 'All recorded revenue', color: chartColors.blue },
  { key: 'ios', label: 'iOS App Store', color: chartColors.green },
]
const viewMetrics: ChartMetric[] = [
  { key: 'estimatedViews', label: 'Estimated from milestones and recordings', color: chartColors.blue },
  { key: 'measuredViews', label: 'Measured from exact snapshots', color: chartColors.green },
]
const viewBases = [
  { value: 'estimated', label: 'Estimated daily views' },
  { value: 'cohort', label: 'Submission cohort views' },
  { value: 'measured', label: 'Measured views gained' },
] as const
const dollars = (value: number) => money(value, 'USD')
const conversion = (value: number | null) => value == null ? '—' : percent(value, 1)
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export default function CreatorDailyDrivers({ report }: { report: DailyDriverReport }) {
  const { daily, mix } = report
  const [selectedDay, setSelectedDay] = useState('')
  const [basis, setBasis] = useState<typeof viewBases[number]['value']>('estimated')
  const selected = daily.find(row => row.day === selectedDay) ?? daily.at(-1)!
  const associations = useMemo(() => creatorRevenueAssociations(report), [report])
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
  const formatAssociation = ({ rho, days }: typeof associations[number]['sameDay']) => rho == null ? `— (${days} days)` : `${rho.toFixed(2)} (${days} days)`
  return <>
    <Panel title="Daily revenue and reach" description={`${shortDay(daily[0].day)} – ${shortDay(daily.at(-1)!.day)} · Last 30 complete Pacific days · All social platforms`}
      note="Revenue is recorded collections after refunds, before fees, across billing channels. Non-USD payments use provider USD conversions when available. New submissions count first submissions only; cohort views are the current reported totals on those posts, not views gained that day. Estimated views split the first recorded count evenly from the publication date through the submission date. If publication is unknown, the estimate starts one day before submission. Each rereview, exact verified recording, or TikTok snapshot adds only the increase since the last count, split across the intervening days. We do not project views past the last count. Recent estimates have less time to pick up rereviews and can rise as later counts come in. Measured views are changes between consecutive Pacific-day exact snapshots of the same post and source, 18–30 hours apart. Missing pairs are blank. Creator reach and clicks exclude the existing experimental creators; revenue includes all non-internal customers. Signed-in iOS paywall conversion counts accounts with a matching initial payment, trial conversion, or one-time sale later that day. It excludes renewals, unlinked purchases and later-day conversions. Top iOS build is the most common build in recorded first-open events, not a release date.">
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat title={missingUsd ? 'Known revenue after refunds' : 'Revenue after refunds'} value={dollars(daily.reduce((sum, day) => sum + day.revenue, 0))} note={missingUsd ? `${missingUsd} billing events lack a USD conversion` : 'All recorded channels · USD before fees'} />
        <Stat title="Estimated reach coverage" value={`${estimatedDays} / ${daily.length} days`} note="Days with anchored estimates · recent dates can be revised" />
        <Stat title="Measured reach coverage" value={`${measuredDays} / ${daily.length} days`} note="Days with at least one comparable post snapshot pair" />
        <Stat title="Matched iOS paywall conversion" value={percent(daily.reduce((sum, day) => sum + day.paidAfterPaywall, 0), daily.reduce((sum, day) => sum + day.paywallAccounts, 0))} note="Same-day purchase rate among signed-in paywall accounts" />
      </div>
      <AnalyticsChart title="Daily revenue after refunds" rows={daily.map(day => ({ ...day, revenue: day.missingUsd ? null : day.revenue, ios: day.missingUsd ? null : day.ios }))} metrics={moneyMetrics} days={daily.length} currency="USD" granularity="daily" timeZone="UTC" />
      <AnalyticsChart title="Daily creator views" rows={daily} metrics={viewMetrics} days={daily.length} granularity="daily" timeZone="UTC" />
      <Table columns={['day','revenue','ios_revenue','web_revenue','ios_renewals','ios_nonrenewal_sales','refunds','missing_usd_events','new_submissions','estimated_daily_views','posts_in_estimate','cohort_views','measured_views_gained','measured_posts','creator_clicks','ios_first_opens','top_ios_build','signed_in_paywall_accounts','matched_purchases','same_day_conversion']} rows={[...daily].reverse().map(day => ({
        day: day.day, revenue: `${dollars(day.revenue)}${day.missingUsd ? ' known' : ''}`, ios_revenue: dollars(day.ios), web_revenue: dollars(day.web), ios_renewals: dollars(day.iosRenewals), ios_nonrenewal_sales: day.iosSales, refunds: dollars(day.refunds), missing_usd_events: day.missingUsd,
        new_submissions: day.submissions, estimated_daily_views: day.estimatedViews, posts_in_estimate: day.estimatedPosts, cohort_views: day.cohortViews, measured_views_gained: day.measuredViews, measured_posts: day.measuredPosts, creator_clicks: day.clicks, ios_first_opens: day.firstOpens, top_ios_build: day.dominantIosBuild ? `${day.dominantIosBuild} · ${conversion(day.dominantIosBuildShare)}` : null,
        signed_in_paywall_accounts: day.paywallAccounts, matched_purchases: day.paidAfterPaywall, same_day_conversion: conversion(paywallRate(day)),
      }))} />
    </Panel>
    <Panel title="Campaign and audience mix" description="Pick a day to see which campaigns and countries contributed to the available reach data."
      action={<div className="flex flex-wrap gap-3"><AnalyticsSelect label="Day" value={selected.day} onChange={setSelectedDay} options={[...daily].reverse().map(row => ({ value: row.day, label: shortDay(row.day) }))} /><AnalyticsSelect label="View basis" value={basis} onChange={value => setBasis(viewBases.find(option => option.value === value)?.value ?? 'estimated')} options={[...viewBases]} /></div>}
      note="Country counts are estimates: post views weighted by the named country percentages in verified audience recordings. These recordings reflect cumulative viewer mix, not daily impressions by country. For measured gains, only a recording assessed by the closing observation is eligible. Estimated and cohort views use audience evidence available by the end of this report. Any unlisted or unverified share stays in Other / not identified. Campaigns use current post assignments; these are reach shares, not revenue attribution. Approved tiers use the latest recorded approval as of the report cutoff, so they are retrospective. Approved Tier 1 percentages are weighted by views and never used to infer individual countries.">
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
      note="The summary uses pairs where both metrics were verified in the same recording. Unverified OCR reads are available below and are excluded from totals and correlations. These are cumulative counts through the recording date, not daily viewers. The campaign totals add each post’s unique viewer count; the same person can appear on multiple posts. Views per viewer uses the sum of views divided by the sum of per-post viewers. Some recordings show abbreviated view counts and ratios based on them are approximate.">
      <Table columns={['campaign','posts_with_both_metrics','sum_of_post_viewers','total_views','views_per_viewer','approximate_view_counts']} rows={[...ocrCampaigns].sort((a, b) => b[1].views - a[1].views).map(([campaign, row]) => ({
        campaign, posts_with_both_metrics: row.posts, sum_of_post_viewers: row.viewers, total_views: row.views,
        views_per_viewer: `${row.approximate ? '≈' : ''}${(row.views / row.viewers).toFixed(2)}×`, approximate_view_counts: row.approximate,
      }))} />
      {recordings.some(row => !row.verified) && <p className="mt-3 text-xs text-zinc-600">{count(recordings.filter(row => !row.verified).length)} unverified OCR pairs are available in the underlying data.</p>}
      {recordings.length > 0 && <DataDetails><Table columns={['recording_day','campaign','post','approved_tier','unique_viewers','total_views','views_per_viewer','evidence']} rows={recordings.map(row => ({
        recording_day: row.day, campaign: row.campaign, post: row.title, approved_tier: row.tier, unique_viewers: row.viewers,
        total_views: row.exact ? count(row.views) : `≈${count(row.views)}`, views_per_viewer: `${row.exact && row.verified ? '' : '≈'}${(row.views / row.viewers).toFixed(2)}×`,
        evidence: row.verified ? 'Both metrics verified' : 'OCR read · unverified',
      }))} /></DataDetails>}
    </Panel>
    <Panel title="What moves with revenue?" description="Rank correlations show which signals tend to rise or fall with revenue. The day-to-day column helps spot relationships that are more than a shared monthly trend."
      note="Spearman rank correlation ranges from −1 to +1. At least 10 valid pairs and variation in both series are required; revenue days missing USD conversions are excluded. Next-day and two-days-later columns compare a signal with later revenue. The day-to-day column compares changes from the prior calendar day. The five campaigns with the most estimated views are included. Estimated views are reconstructed using later rereviews, so lagged comparisons are retrospective rather than forecasts. Country share uses only the named audience, whose coverage varies. These exploratory comparisons do not establish causation; paywall purchases also contribute directly to revenue.">
      <Table columns={['signal','same_day','next_day','two_days_later','day_to_day_changes']} rows={associations.map(row => ({ signal: row.label, same_day: formatAssociation(row.sameDay), next_day: formatAssociation(row.nextDay), two_days_later: formatAssociation(row.twoDays), day_to_day_changes: formatAssociation(row.changes) }))} />
    </Panel>
  </>
}
