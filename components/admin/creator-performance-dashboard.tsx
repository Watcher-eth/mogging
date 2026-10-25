import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import type { PerformanceRevenue } from '@/lib/admin/creator-performance-revenue'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { buildCreatorPerformance, viewCpm } from '@/lib/admin/creator-performance'
import type { AdminDashboard } from './creator-types'
import { DataDetails, Panel, Stat, Table, count } from './analytics-ui'

const usd = (value: number | null) => value === null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const short = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const change = (current: number, previous: number) => previous > 0 ? `${current >= previous ? '+' : ''}${((current / previous - 1) * 100).toFixed(1)}% vs previous period` : 'No prior-period baseline'
const fieldClass = 'min-h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
type Series = { key: string; label: string; color: string; axis?: 'views' }
type ChartRow = { day: string; [key: string]: string | number | null }

export default function CreatorPerformanceDashboard({ data }: { data: AdminDashboard }) {
  const [days, setDays] = useState('7')
  const [platform, setPlatform] = useState('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('views')
  const report = useMemo(() => buildCreatorPerformance(data, { days: days === 'all' ? null : Number(days), platform }), [data, days, platform])
  const { total, previous } = report
  const { data: revenue, error: revenueError, mutate: reloadRevenue } = useSWR<PerformanceRevenue>(`/api/admin/creator/performance-revenue?start=${report.start}&end=${report.today}&platform=${platform}`, apiGet, { refreshInterval: 30000, keepPreviousData: false })
  const revenueByDay = new Map(revenue?.daily.map(row => [row.day, row]))
  const comparison = report.daily.map(row => ({ ...row, appRevenue: revenueByDay.get(row.day)?.appRevenue || 0, attributedRevenue: revenueByDay.get(row.day)?.attributedRevenue || 0 }))
  const cpm = viewCpm(total.earnedCents, total.costViews)
  const creators = report.creators.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())).sort((a, b) =>
    sort === 'spend' ? b.earnedCents - a.earnedCents : sort === 'cpm' ? (viewCpm(b.earnedCents, b.costViews) ?? -1) - (viewCpm(a.earnedCents, a.costViews) ?? -1) : b.reportedViews - a.reportedViews)
  const series = platform === 'all' ? [{ key: 'tiktokViews', label: 'TikTok', color: '#181a1d' }, { key: 'instagramViews', label: 'Instagram', color: '#9b83e5' }] : [{ key: 'reportedViews', label: 'Reported views', color: '#00A8EF' }]
  return <div className="space-y-6 [&_td]:whitespace-nowrap">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <p className="max-w-2xl text-sm leading-6 text-zinc-500">Views, payout obligations, and cost efficiency from submitted posts. Dates use Pacific time; today is partial.</p>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-500">Chart period<select value={days} onChange={e => setDays(e.target.value)} className={fieldClass}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All time</option></select></label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-500">Platform<select value={platform} onChange={e => setPlatform(e.target.value)} className={fieldClass}><option value="all">All platforms</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option></select></label>
      </div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Stat title="Views on submitted posts" value={short(total.reportedViews)} note={`${count(total.posts)} posts · ${days === 'all' ? 'All recorded submissions' : change(total.reportedViews, previous.reportedViews)}`} />
      <Stat title="Earned payouts" value={usd(total.earnedCents / 100)} note={`${usd(total.unpaidCents / 100)} still unpaid on these posts`} />
      <Stat title="Earned CPM" value={usd(cpm)} note={`Per 1,000 reviewed views · ${short(total.costViews)} views`} />
      <Stat title="Cash paid in period" value={usd(report.cashPaidCents / 100)} note="By payment date, including older posts" />
    </div>
    <p className="text-xs text-zinc-500">Excluded experiments: matheo.psl, bejapsl, and Valerie. Their posts, views, payouts, and attributed revenue are excluded throughout this report.</p>
    <Panel title="Views, spend, and revenue" description="Compare daily submitted-video views with earned payouts and recorded revenue. USD on the left axis; views on the right." note="Views and earned payouts follow the original submission date, using current counts and approvals. App revenue follows the billing-event date; attributed revenue follows the date attribution was recorded. App revenue covers all acquisition channels and stays global when filtering TikTok or Instagram. Known experiment-attributed billing events are excluded. Refunds reduce revenue; amounts are before store fees and tax adjustments. This is a timing comparison, not proof of causation or creator ROAS. A zero attributed-revenue line means no revenue was recorded as directly attributed, not that creators produced no sales.">
      {revenueError ? <p role="alert" className="admin-notice">Revenue could not be loaded. <button type="button" className="underline" onClick={() => void reloadRevenue()}>Retry</button></p> : !revenue ? <p role="status" className="admin-chart-loading">Loading verified revenue…</p> : <>
        <PerformanceChart rows={comparison} series={[{ key: 'reportedViews', label: 'Submitted-video views', color: '#52565c', axis: 'views' }, { key: 'earned', label: 'Earned spend', color: '#00A8EF' }, { key: 'appRevenue', label: 'App revenue (all channels)', color: '#40a88a' }, { key: 'attributedRevenue', label: 'Creator-attributed revenue', color: '#9b83e5' }]} title="Views, spend, and revenue" currency />
        <div className="mt-5 grid gap-4 sm:grid-cols-3"><Stat title="Earned creator spend" value={usd(total.earnedCents / 100)} note="Experimental creators excluded" /><Stat title="Recorded app revenue · USD" value={usd(comparison.reduce((sum, row) => sum + row.appRevenue, 0))} note="All acquisition channels; refunds deducted" /><Stat title="Directly attributed revenue · USD" value={usd(comparison.reduce((sum, row) => sum + row.attributedRevenue, 0))} note="Selected social platform; experiments excluded" /></div>
        {revenue.otherCurrencies.length ? <p className="mt-4 text-xs leading-5 text-zinc-500">Other recorded revenue, kept separate from the USD chart: {revenue.otherCurrencies.map(row => `${row.amount.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${row.currency}`).join(' · ')}.</p> : null}
      </>}
    </Panel>
    <Panel title="Views by submission day" description="The latest reported view count of each video, grouped by the day it was first submitted." note="Each post is counted once. We use the larger of its latest submitted and admin-reviewed counts. Rereviews update that post’s existing submission day. This is a submission-cohort report, not views gained on each calendar day; true daily view growth requires historical view snapshots.">
      <PerformanceChart rows={report.daily} series={series} title="Views by submission day" />
      <div className="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-sm text-zinc-500"><span><strong className="text-zinc-900">{count(total.posts)}</strong> posts submitted</span><span><strong className="text-zinc-900">{count(total.approvedPosts)}</strong> with approved earnings</span><span><strong className="text-zinc-900">{short(total.reviewedViews)}</strong> admin-reviewed views</span></div>
    </Panel>
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Spend and payouts" description="Earned payouts follow submission day. Cash paid follows the actual payment date." note="Earned payouts include approved unpaid balances, custom payout adjustments, and previously paid earnings. Paying a post does not add to its earned cost again. Failed, cancelled, and merely scheduled transfers are not cash paid. All amounts are USD and linked to a submitted post.">
        <PerformanceChart rows={report.daily} series={[{ key: 'earned', label: 'Earned payouts', color: '#00A8EF' }, { key: 'cashPaid', label: 'Cash paid', color: '#40a88a' }]} title="Spend and payouts" currency />
      </Panel>
      <Panel title="Cost per 1,000 views" description="Daily weighted CPM for the posts submitted that day, based on their current reviewed views and earned payouts." note="CPM = earned USD ÷ reviewed views on posts with approved earnings × 1,000. Pending and rejected posts without approved earnings do not dilute the denominator. Period and creator CPMs use the ratio of totals, never an average of daily CPMs. A dash means no eligible reviewed views.">
        <PerformanceChart rows={report.daily} series={[{ key: 'cpm', label: 'Earned CPM', color: '#9b83e5' }]} title="Earned CPM" currency />
        <p className="mt-4 text-xs text-zinc-500">Period CPM: <strong className="text-zinc-900">{usd(cpm)}</strong> · All-time CPM: <strong className="text-zinc-900">{usd(viewCpm(report.allTime.earnedCents, report.allTime.costViews))}</strong></p>
      </Panel>
    </div>
    <Panel title="Platform breakdown" description="Selected chart period. Views and earned spend use the same submission cohorts.">
      <Table rows={report.platforms.map(row => ({ platform: row.platform === 'tiktok' ? 'TikTok' : row.platform === 'instagram' ? 'Instagram' : row.platform, posts: row.posts, reported_views: row.reportedViews, reviewed_views: row.reviewedViews, earned: usd(row.earnedCents / 100), paid_on_these_posts: usd(row.paidCents / 100), outstanding: usd(row.unpaidCents / 100), CPM: usd(viewCpm(row.earnedCents, row.costViews)) }))} columns={['platform', 'posts', 'reported_views', 'reviewed_views', 'earned', 'paid_on_these_posts', 'outstanding', 'CPM']} />
    </Panel>
    <Panel title="All-time creator performance" description="Always all time, regardless of the chart period. The platform filter applies here too." action={<div className="flex flex-wrap gap-2"><input aria-label="Search creators" placeholder="Search creators…" value={search} onChange={e => setSearch(e.target.value)} className={fieldClass} /><select aria-label="Sort creators" value={sort} onChange={e => setSort(e.target.value)} className={fieldClass}><option value="views">Most views</option><option value="spend">Highest spend</option><option value="cpm">Highest CPM</option></select></div>}>
      <Table rows={creators.map(row => ({ creator: row.name, posts: row.posts, 'TikTok views': row.tiktokViews, instagram_views: row.instagramViews, total_views: row.reportedViews, reviewed_views: row.reviewedViews, earned: usd(row.earnedCents / 100), paid: usd(row.paidCents / 100), outstanding: usd(row.unpaidCents / 100), CPM: usd(viewCpm(row.earnedCents, row.costViews)) }))} columns={['creator', 'posts', 'TikTok views', 'instagram_views', 'total_views', 'reviewed_views', 'earned', 'paid', 'outstanding', 'CPM']} />
      <p className="mt-4 text-xs text-zinc-500">{count(report.allTime.posts)} posts · {count(report.allTime.reportedViews)} total views · {usd(report.allTime.earnedCents / 100)} earned · {usd(report.allTime.paidCents / 100)} paid · {usd(report.allTime.unpaidCents / 100)} unpaid</p>
    </Panel>
    {report.excludedPayments || report.undatedPayments ? <p role="status" className="admin-notice">{report.excludedPayments ? `${count(report.excludedPayments)} paid records are excluded because they are not USD or are not linked to a post. ` : ''}{report.undatedPayments ? `${count(report.undatedPayments)} paid records have no payment date; included in all-time and post totals, excluded from the daily cash chart.` : ''}</p> : null}
  </div>
}

function PerformanceChart({ rows, series, title, currency = false }: { rows: ChartRow[]; series: Series[]; title: string; currency?: boolean }) {
  const config = Object.fromEntries(series.map(s => [s.key, { label: s.label, color: s.color }]))
  const dateLabel = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const hasViewsAxis = series.some(s => s.axis === 'views')
  const formatValue = (value: unknown, key: string) => currency && series.find(s => s.key === key)?.axis !== 'views' ? usd(Number(value)) : count(value)
  if (!rows.some(row => series.some(s => row[s.key] !== null))) return <p className="admin-empty">No reviewed views available to calculate CPM in this period.</p>
  return <div>
    <ChartContainer config={config} className="h-64 w-full aspect-auto" aria-label={title}>
      <LineChart accessibilityLayer data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="#eef0f3" />
        <XAxis dataKey="day" tickFormatter={dateLabel} tickLine={false} axisLine={false} minTickGap={32} />
        <YAxis yAxisId="value" tickFormatter={value => currency ? `$${short(Number(value))}` : short(Number(value))} tickLine={false} axisLine={false} width={62} domain={[(min: number) => Math.min(0, min), 'auto']} />
        {hasViewsAxis ? <YAxis yAxisId="views" orientation="right" tickFormatter={value => short(Number(value))} tickLine={false} axisLine={false} width={62} domain={[0,'auto']} /> : null}
        <ChartTooltip content={<ChartTooltipContent labelFormatter={value => String(value)} formatter={(value, name) => <span>{config[String(name)]?.label || name}: <strong>{formatValue(value,String(name))}</strong></span>} />} />
        {series.map(s => <Line key={s.key} yAxisId={s.axis === 'views' ? 'views' : 'value'} name={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} type="linear" dot={s.key === 'cpm' || rows.length === 1 ? { r: 2 } : false} connectNulls={false} isAnimationActive={false} />)}
      </LineChart>
    </ChartContainer>
    <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">{series.map(s => <span key={s.key} className="flex items-center gap-2"><span className="h-0.5 w-4" style={{ background: s.color }} />{s.label}</span>)}</div>
    <DataDetails><Table rows={rows.map(row => Object.fromEntries([['day', row.day], ...series.map(s => [s.label, row[s.key] === null ? null : formatValue(row[s.key],s.key)])]))} columns={['day', ...series.map(s => s.label)]} /></DataDetails>
  </div>
}
