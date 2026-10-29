import { useState } from 'react'
import { AnalyticsLink as Link } from './analytics-link'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { viewCpm, type CreatorPerformanceReport } from '@/lib/admin/creator-performance'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count } from './analytics-ui'

const usd = (value: number | null) => value == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const compactCount = (value: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
const reach: ChartMetric[] = [{ key: 'reportedViews', label: 'Reported views', color: chartColors.blue }]
const spend: ChartMetric[] = [{ key: 'earned', label: 'Earned cost by submission date', color: chartColors.blue }, { key: 'cashPaid', label: 'Cash paid by payment date', color: chartColors.green }]
const calendarDate = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const date = (value: string | null | undefined) => value ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No record available'
const creatorTable = (rows: CreatorPerformanceReport['periodCreators']): MetricRow[] => rows.map(row => ({ creator: row.name, posts: row.posts, reported_views: row.reportedViews, reviewed_views: row.reviewedViews, earned_cost: usd(row.earnedCents / 100), paid_on_these_posts: usd(row.paidCents / 100), outstanding_on_these_posts: usd(row.unpaidCents / 100), cost_per_1000_reviewed_views: usd(viewCpm(row.earnedCents, row.costViews)) }))
const creatorColumns = ['creator', 'posts', 'reported_views', 'reviewed_views', 'earned_cost', 'paid_on_these_posts', 'outstanding_on_these_posts', 'cost_per_1000_reviewed_views']
const weeklyChange = (current: number, previous: number) => {
  const difference = current - previous
  if (!difference) return '—'
  return `${difference > 0 ? '+' : '−'}${count(Math.abs(difference))} · ${previous ? `${difference > 0 ? '+' : '−'}${(Math.abs(difference) / previous * 100).toFixed(1)}%` : 'new'}`
}

export default function CreatorPerformanceDashboard({ data, attributionHref = '/admin/attribution' }: { data: AnalyticsDashboard; attributionHref?: string }) {
  const [platform, setPlatform] = useState<'all' | 'tiktok' | 'instagram'>('all')
  const [metric, setMetric] = useState('views')
  const [search, setSearch] = useState('')
  const [showAllCreators, setShowAllCreators] = useState(false)
  const snapshot = data.creatorPerformance
  if (!snapshot) return <Notice>Creator performance could not be established from this snapshot. Missing data is not shown as zero.</Notice>
  const report = snapshot.reports[platform]
  const { total, allTime } = report
  const weeklyCreators = [...report.creators].sort((a, b) => b.weekViews - a.weekViews || b.reportedViews - a.reportedViews || a.name.localeCompare(b.name))
  const creators = report.periodCreators.filter(row => row.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => metric === 'cost' ? b.earnedCents - a.earnedCents : metric === 'cpm' ? (viewCpm(b.earnedCents, b.costViews) ?? -1) - (viewCpm(a.earnedCents, a.costViews) ?? -1) : b.reportedViews - a.reportedViews)
  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs leading-5 text-zinc-500">{calendarDate(report.start)} – {calendarDate(report.today)} · Pacific calendar dates · Today is partial · USD</p>
      <AnalyticsSelect label="Social platform" value={platform} onChange={value => setPlatform(value as typeof platform)} options={[{ value: 'all', label: 'All social platforms' }, { value: 'tiktok', label: 'TikTok' }, { value: 'instagram', label: 'Instagram' }]} />
    </div>
    <p className="mb-5 text-sm leading-6 text-zinc-500">Current reported views and earned costs for posts first submitted in the selected period. Cash paid follows payment dates and can include older posts.</p>
    <div className="admin-stats-grid">
      <Stat title="Reported post views" value={count(total.reportedViews)} note={`${count(total.posts)} submitted posts · ${count(total.reviewedViews)} admin-reviewed views`} />
      <Stat title="Earned post cost" value={usd(total.earnedCents / 100)} note={`${usd(total.unpaidCents / 100)} remains unpaid on these posts · current earned balance`} />
      <Stat title="Cost per 1,000 reviewed views" value={usd(viewCpm(total.earnedCents, total.costViews))} note={`${count(total.costViews)} eligible reviewed views · ratio of total earned cost to eligible views`} />
      <Stat title="Cash paid for posts" value={usd(report.cashPaidCents / 100)} note="Completed USD payments dated in this period · includes older posts" />
    </div>
    {total.posts === 0 ? <Notice>No included posts were submitted in this period. Payment-date activity and all-time payout balances are reported separately.</Notice> : null}
    <Panel title="Content reach by submission date" description="Current reported views grouped by the day each post was first submitted."
      note="Source: creator submission records, using the larger of the latest creator-reported and admin-reviewed view counts. This is cumulative reach of submission cohorts, not views gained on each calendar day and not unique people. The earliest recorded submission event defines the cohort date; older records without that event use the post record’s creation date. Rereviews update the original cohort. Pending and rejected posts remain in reported reach, but do not supply approved cost-view denominators. Missing view snapshots and views beyond the last update are not estimated. Dates are Pacific calendar labels; empty days mean no included submissions, not zero platform activity.">
      <AnalyticsChart title="Content reach by submission date" rows={report.daily} metrics={reach} valueFormatter={compactCount} days={report.days} granularity="daily" timeZone="UTC" />
      <DataDetails><Table rows={report.daily.map(row => ({ day: row.day, posts: row.posts, reported_views: row.reportedViews, reviewed_views: row.reviewedViews, tiktok_views: row.tiktokViews, instagram_views: row.instagramViews }))} columns={['day', 'posts', 'reported_views', 'reviewed_views', 'tiktok_views', 'instagram_views']} /></DataDetails>
    </Panel>
    <Panel title="Earned cost and cash payments" description="Earned cost follows submission dates; cash paid follows payment dates. These are different timing views."
      note="Source: approved earnings and completed creator payment records linked to posts. Earned cost uses the existing payout rules, approved adjustments and a floor of amounts already paid. Paying a post does not add to its earned cost again. Failed, cancelled, pending and processing transfers are excluded from cash paid. All amounts are USD. Cash can pay for posts submitted before the selected period, so these series must not be subtracted to calculate the outstanding balance. Current unpaid balances are shown below.">
      <AnalyticsChart title="Earned cost and cash payments" rows={report.daily} metrics={spend} days={report.days} currency="USD" granularity="daily" timeZone="UTC" />
      <DataDetails><Table rows={report.daily.map(row => ({ day: row.day, earned_cost: usd(row.earned), cash_paid: usd(row.cashPaid) }))} columns={['day', 'earned_cost', 'cash_paid']} /></DataDetails>
    </Panel>
    <Panel title="Creator leaders · last 7 days" description={`${calendarDate(report.weekStart)} – ${calendarDate(report.today)} · Ranked by views on new submissions · Changes vs previous 7 days · Today is partial`}
      note="Seven Pacific calendar dates, independent of the page’s period selector. Views are the latest reported totals on posts first submitted in each week, not views gained during that week. Changes compare with the preceding seven calendar dates. Rereviews do not count as new submissions. The social-platform filter and experimental exclusions apply.">
      <Table rows={(showAllCreators ? weeklyCreators : weeklyCreators.slice(0, 10)).map((row, index) => ({ rank: index + 1, creator: row.name, total_views: row.reportedViews, views_7d: row.weekViews, view_change: weeklyChange(row.weekViews, row.previousWeekViews), submissions_7d: row.weekPosts, submission_change: weeklyChange(row.weekPosts, row.previousWeekPosts) }))} columns={['rank', 'creator', 'total_views', 'views_7d', 'view_change', 'submissions_7d', 'submission_change']} />
      {weeklyCreators.length > 10 ? <button type="button" aria-expanded={showAllCreators} onClick={() => setShowAllCreators(current => !current)} className="mt-4 text-sm font-medium text-[#008ac5] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">{showAllCreators ? 'Show top 10' : `Show all ${weeklyCreators.length} creators`}</button> : null}
    </Panel>
    <Panel title="Creator comparison" description="Posts submitted in the selected period. The social-platform filter applies."
      action={<div className="flex flex-wrap gap-3"><input aria-label="Search creators" placeholder="Search creators…" value={search} onChange={event => setSearch(event.target.value)} className="h-10 rounded-xl border border-zinc-200 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-400" /><AnalyticsSelect label="Compare" value={metric} onChange={setMetric} options={[{ value: 'views', label: 'Reported views' }, { value: 'cost', label: 'Earned cost' }, { value: 'cpm', label: 'Cost per 1,000 views' }]} /></div>}
      note="CPM uses earned USD divided by reviewed views on posts with approved earnings, multiplied by 1,000. It is a weighted ratio of totals, not an average of creator or daily CPMs. No eligible reviewed views means CPM is unavailable. Reported reach includes unapproved posts, while the cost denominator does not. View counts are observations, not audited impressions. No ROAS or causal revenue claim is inferred from these costs.">
      <Bars animated labelWidth={180} rows={creators.slice(0, 10).map(row => ({ label: row.name, value: metric === 'cost' ? row.earnedCents / 100 : metric === 'cpm' ? viewCpm(row.earnedCents, row.costViews) : row.reportedViews, detail: `${count(row.posts)} posts · ${usd(row.earnedCents / 100)} earned · ${count(row.costViews)} eligible reviewed views` }))} format={metric === 'views' ? compactCount : usd} />
      <DataDetails><Table rows={creatorTable(creators)} columns={creatorColumns} /><p className="mt-3 text-xs text-zinc-500">Chart shows the top ten matches; the table includes all matching creators in this submission period.</p></DataDetails>
    </Panel>
    <Panel title="Post earnings and payouts" description="Current all-time balances for included posts on the selected social platform. Independent of the period filter."
      note="This is the current position of post-linked USD earnings and paid transfers. All-time cash includes paid records without payment dates; the period chart cannot place those records on a day. Unlinked bonuses, referral awards and other non-post payments are outside this report. Earned costs and cash paid overlap and must not be added together. Experimental creators remain excluded. These are recorded obligations and payments, not bank-reconciled cash balances.">
      <div className="grid gap-6 sm:grid-cols-3">
        <Stat title="Total earned for posts" value={usd(allTime.earnedCents / 100)} note="All included submission history · approved and paid earnings" />
        <Stat title="Total paid toward posts" value={usd(allTime.paidCents / 100)} note="Completed linked USD payments · including records without payment dates" />
        <Stat title="Outstanding earned payouts" value={usd(allTime.unpaidCents / 100)} note="Earned balance not yet paid · pending transfers remain outstanding" />
      </div>
      <DataDetails><Table rows={creatorTable(report.creators)} columns={creatorColumns} /></DataDetails>
    </Panel>
    {platform === 'all' ? <Panel title="Platform mix" description="Selected submission period · current reported reach and earned costs.">
      <Table rows={report.platforms.map(row => ({ platform: row.platform === 'tiktok' ? 'TikTok' : row.platform === 'instagram' ? 'Instagram' : row.platform, posts: row.posts, reported_views: row.reportedViews, reviewed_views: row.reviewedViews, earned_cost: usd(row.earnedCents / 100), unpaid_on_these_posts: usd(row.unpaidCents / 100), cost_per_1000_reviewed_views: usd(viewCpm(row.earnedCents, row.costViews)) }))} columns={['platform', 'posts', 'reported_views', 'reviewed_views', 'earned_cost', 'unpaid_on_these_posts', 'cost_per_1000_reviewed_views']} />
    </Panel> : null}
    <Panel title="Data sources and coverage" description="Database observation times and reporting exclusions.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[
        ['Snapshot generated', data.generatedAt], ['Latest submission update', snapshot.latestSubmissionUpdate], ['Latest paid-record update', snapshot.latestPaymentUpdate],
      ].map(([title, value]) => <div key={title}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{date(value)}</dd></div>)}</dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks every minute while visible and on return to this tab. Snapshots use a 60-second cache with background revalidation. Update timestamps cover all submitted posts and paid records loaded for this report, before social-platform and experiment exclusions. They do not verify current social-platform view counts.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Existing experimental exclusions are preserved: matheo.psl, bejapsl, Jeff / youcalb and Valerie. Drafts are excluded. Post views and costs follow submission date; current approved adjustments can change older cohorts.</p>
      <DataDetails><Table rows={[
        { metric: 'Latest submitted post', value: date(snapshot.latestSubmission) },
        { metric: 'Paid records excluded because they are non-USD or not linked to a post', value: report.excludedPayments },
        { metric: 'Included paid records without a payment date', value: report.undatedPayments },
      ]} columns={['metric', 'value']} /></DataDetails>
      <Link className="mt-5 inline-block text-sm font-medium text-[#008ac5] underline underline-offset-4" href={attributionHref}>View creator-attributed customers and revenue →</Link>
    </Panel>
  </>
}
