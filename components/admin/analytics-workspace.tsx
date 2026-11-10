import { WEB_FLOW_VERSION } from '@/lib/analytics/web-context'
import { webJourneyDimensions } from '@/lib/analytics/web-context'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { RefreshCw } from '@/components/ui/mogging-glyphs'
import { AdminPasswordGate } from './admin-password-gate'
import { CreatorHeader } from '@/components/creator/creator-header'
import { Button } from '@/components/ui/button'
import { apiGet, ApiClientError } from '@/lib/api/client'
import { adminPage } from '@/lib/admin/navigation'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { AnalyticsSelect } from './analytics-select'
import { ProductOverview } from './product-overview'
import { PERFORMANCE_EXCLUDED_CREATOR_IDS } from '@/lib/admin/creator-performance'
import { DataDetails, Notice, Panel, Stat, Table, count, label, money } from './analytics-ui'

function ReportLoading() {
  return <div role="status" className="admin-loading">
    <span className="sr-only">Loading report…</span>
    <div className="admin-stats-grid" aria-hidden="true">{[0, 1, 2, 3].map(index => <span key={index} className="admin-loading-tile" />)}</div>
    <div className="admin-loading-chart" aria-hidden="true" />
  </div>
}

const NotificationsDashboard = dynamic(() => import('./notifications-dashboard').then(module => module.NotificationsDashboard), { loading: ReportLoading })
const DataHealthDashboard = dynamic(() => import('./data-health-dashboard').then(module => module.DataHealthDashboard), { loading: ReportLoading })
const ReferralsDashboard = dynamic(() => import('./referrals-dashboard').then(module => module.ReferralsDashboard), { loading: ReportLoading })
const EngagementDashboard = dynamic(() => import('./engagement-dashboard').then(module => module.EngagementDashboard), { loading: ReportLoading })
const WebJourneyDashboard = dynamic(() => import('./web-journey-dashboard').then(module => module.WebJourneyDashboard), { loading: ReportLoading })
const PurchaseFlowDashboard = dynamic(() => import('./purchase-flow-dashboard').then(module => module.PurchaseFlowDashboard), { loading: ReportLoading })
const ExperimentsReport = dynamic(() => import('./experiments-report').then(module => module.ExperimentsReport), { loading: ReportLoading })
const ReliabilityDashboard = dynamic(() => import('./reliability-report').then(module => module.ReliabilityDashboard), { loading: ReportLoading })
const AcquisitionDashboard = dynamic(() => import('./acquisition-dashboard').then(module => module.AcquisitionDashboard), { loading: ReportLoading })
const OnboardingDashboard = dynamic(() => import('./onboarding-dashboard').then(module => module.OnboardingDashboard), { loading: ReportLoading })
const WebOnboardingDashboard = dynamic(() => import('./onboarding-dashboard').then(module => module.WebOnboardingDashboard), { loading: ReportLoading })
const CreatorEconomicsOverview = dynamic(() => import('./creator-economics-overview').then(module => module.CreatorEconomicsOverview), { loading: ReportLoading })
const CreatorPerformanceDashboard = dynamic(() => import('./creator-performance-dashboard'), { loading: ReportLoading })
const CreatorAttributionOverview = dynamic(() => import('./creator-attribution-overview').then(module => module.CreatorAttributionOverview), { loading: ReportLoading })
const RetentionDashboard = dynamic(() => import('./retention-dashboard').then(module => module.RetentionDashboard), { loading: ReportLoading })
const RevenueDashboard = dynamic(() => import('./revenue-dashboard').then(module => module.RevenueDashboard), { loading: ReportLoading })

const periods = [1, 7, 14, 30, 90]
const platformTabs = new Set(['Overview', 'Acquisition', 'Retention', 'Purchases'])
const viewOptions: Record<string, Array<{ value: string; label: string }>> = {
  Onboarding: [{ value: 'app', label: 'Mobile app' }, { value: 'web', label: 'Web' }],
  CreatorAttribution: [{ value: 'comparison', label: 'Comparison' }, { value: 'reach', label: 'Content reach' }, { value: 'attribution', label: 'Attribution' }],
  Engagement: [{ value: 'usage', label: 'Product usage' }, { value: 'referrals', label: 'Referrals' }, { value: 'notifications', label: 'Notifications' }],
}
const swrOptions = { dedupingInterval: 60_000, refreshInterval: 60_000, revalidateOnFocus: false, shouldRetryOnError: false }
function reportPath(days: string, platform: string, section: string) {
  return '/api/admin/analytics?' + new URLSearchParams({ days, platform, section })
}

export default function AnalyticsAdminPage() {
  const router = useRouter()
  const page = adminPage(router.pathname)
  const tab = page?.section || 'Overview'
  const options = viewOptions[tab]
  const view = options?.find(option => option.value === router.query.view)?.value ?? (tab === 'Onboarding' && router.query.platform === 'web' ? 'web' : options?.[0].value)
  const section = tab === 'Engagement' && view === 'referrals' ? 'Referrals'
    : tab === 'Engagement' && view === 'notifications' ? 'Notifications'
    : tab === 'CreatorAttribution' && view === 'reach' ? 'CreatorPerformance' : tab
  const defaultDays = tab === 'WebJourney' ? 14 : ['Reliability', 'Revenue'].includes(tab) ? 1 : tab === 'Retention' ? 90
    : ['Overview', 'Acquisition', 'Quality'].includes(tab) ? 7 : 30
  const days = periods.includes(Number(router.query.days)) ? String(router.query.days) : String(defaultDays)
  const canFilterPlatform = platformTabs.has(tab) || section === 'Engagement' || tab === 'Onboarding' && view !== 'web'
  const platform = tab === 'Onboarding' && view === 'web' ? 'web'
    : canFilterPlatform && ['ios','android', ...(tab === 'Purchases' || tab === 'Onboarding' ? [] : ['web'])].includes(String(router.query.platform)) ? String(router.query.platform) : 'all'
  const webVersion = typeof router.query.webVersion === 'string' ? router.query.webVersion : WEB_FLOW_VERSION
  const webDimension = webJourneyDimensions.includes(router.query.webDimension as typeof webJourneyDimensions[number]) ? String(router.query.webDimension) : 'channel'
  const webQuery = tab === 'WebJourney' ? '&' + new URLSearchParams({ webVersion, webDimension }) : ''
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet, { shouldRetryOnError: false, dedupingInterval: 60_000 })
  const ready = router.isReady && access.data?.unlocked
  const report = useSWR<AnalyticsDashboard>(ready ? reportPath(days, platform, section) + webQuery : null, apiGet, { ...swrOptions, keepPreviousData: true })
  const reach = useSWR<AnalyticsDashboard>(ready && view === 'comparison' ? reportPath(days, 'all', 'CreatorPerformance') : null, apiGet, swrOptions)
  const providers = useSWR<Pick<AnalyticsDashboard, 'revenueCatMetrics' | 'appStoreSales'>>(ready && tab === 'Revenue' ? '/api/admin/analytics?section=Revenue&view=providers' : null, apiGet, swrOptions)
  const expired = report.error instanceof ApiClientError && report.error.status === 401
  if (access.error) return <Notice>Admin access could not be verified. Reload or sign in with an authorized account.</Notice>
  if (access.isLoading && !access.data) return <ReportLoading />
  if (!access.data?.unlocked || expired) return <AdminPasswordGate onUnlocked={() => void access.mutate()} />

  const snapshot = report.data
  const data = snapshot?.filters.section === section && snapshot.filters.platform === platform ? snapshot : undefined
  const displayDays = Number(data?.filters.days ?? days)
  const previousPeriod = data && data.filters.days !== days
  const reachData = reach.data?.filters.days === data?.filters.days ? reach.data : undefined
  const filter = (key: string, value: string) => {
    void router.replace({ pathname: router.pathname, query: { ...router.query, [key]: value } }, undefined, { shallow: true, scroll: false })
  }
  const refresh = () => {
    void report.mutate()
    if (view === 'comparison') void reach.mutate()
    if (tab === 'Revenue') void providers.mutate()
  }
  const refreshing = report.isValidating || reach.isValidating || providers.isValidating
  return <>
    <CreatorHeader eyebrow="Analytics" title={page?.title || 'Product overview'} description={page?.description || 'Understand daily activity and the path to value.'} />
    <div className="admin-report-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        {options && view && <div className="admin-view-switch" role="group" aria-label={page?.title + ' view'}>
          {options.map(option => <button key={option.value} type="button" aria-pressed={view === option.value}
            onClick={() => filter('view', option.value)}>{option.label}</button>)}
        </div>}
        <AnalyticsSelect label="Period" value={days} onChange={value => filter('days', value)} options={periods.map(day => ({ value: String(day), label: day === 1 ? 'Last 24 hours' : `Last ${day} days` }))} />
        {canFilterPlatform && <AnalyticsSelect label="Platform" value={platform} onChange={value => filter('platform', value)}
          options={['all', 'ios', 'android', ...(tab === 'Onboarding' || tab === 'Purchases' ? [] : ['web'])].map(value => ({ value, label: value === 'all' ? 'All platforms' : value === 'ios' ? 'iOS' : label(value) }))} />}
        {tab === 'WebJourney' && <>
          <AnalyticsSelect label="Tracking version" value={webVersion} onChange={value => filter('webVersion', value)}
            options={[...new Set([WEB_FLOW_VERSION, webVersion, ...(data?.webJourney?.versions.map(row => String(row.version)) ?? [])])].map(value => ({ value, label: value === WEB_FLOW_VERSION ? 'Current tracking' : value === 'legacy' ? 'Legacy · incomplete' : value }))} />
          <AnalyticsSelect label="Breakdown" value={webDimension} onChange={value => filter('webDimension', value)} options={webJourneyDimensions.map(value => ({ value, label: label(value) }))} />
        </>}
        <Button variant="ghost" className="size-10 p-0 text-[#73777d]" aria-label="Refresh analytics" disabled={refreshing} onClick={refresh}><RefreshCw className={`size-4 ${refreshing ? 'motion-safe:animate-spin' : ''}`} /></Button>
      </div>
      <p className="text-xs text-[#73777d]" aria-live="polite">{data ? (previousPeriod ? `Previous ${displayDays}-day period · ` : 'Updated ') + formatReportingTime(data.generatedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Pacific time'}</p>
    </div>
    {report.error && <Notice>{data ? 'Refresh failed. The previous snapshot is still available.' : 'Analytics could not load.'} <button className="underline" onClick={refresh}>Try again</button></Notice>}
    {!data ? !report.error && <ReportLoading /> : <div key={section + ':' + view} className="admin-report-enter" aria-busy={report.isValidating && previousPeriod || undefined}>
      {section === 'Overview' && <ProductOverview data={data} days={displayDays} />}
      {section === 'Experiments' && <ExperimentsReport data={data} />}
      {section === 'Acquisition' && <AcquisitionDashboard data={data} days={displayDays} />}
      {section === 'Onboarding' && (view === 'web' ? <WebOnboardingDashboard data={data} days={displayDays} /> : <OnboardingDashboard data={data} days={displayDays} />)}
      {section === 'Revenue' && <RevenueDashboard data={providers.data ? { ...data, ...providers.data } : data} days={displayDays} providerStatus={providers.error ? 'unavailable' : providers.data ? undefined : 'loading'} />}
      {section === 'CreatorEconomics' && <CreatorEconomicsOverview data={data} days={displayDays} />}
      {section === 'CreatorPerformance' && <CreatorPerformanceDashboard data={data} attributionHref="/admin/attribution?view=attribution" />}
      {section === 'CreatorAttribution' && (view === 'comparison'
        ? reachData ? <CreatorComparison data={data} reach={reachData} /> : reach.error ? <Notice>Content reach could not load. <button className="underline" onClick={refresh}>Try again</button></Notice> : <ReportLoading />
        : <CreatorAttributionOverview data={data} days={displayDays} />)}
      {section === 'Retention' && <RetentionDashboard data={data} days={displayDays} />}
      {section === 'WebJourney' && <WebJourneyDashboard data={data} days={displayDays} />}
      {section === 'Purchases' && <PurchaseFlowDashboard data={data} days={displayDays} />}
      {section === 'Engagement' && <EngagementDashboard data={data} days={displayDays} />}
      {section === 'Referrals' && <ReferralsDashboard data={data} days={displayDays} />}
      {section === 'Notifications' && <NotificationsDashboard data={data} days={displayDays} />}
      {section === 'Reliability' && data.reliability && <ReliabilityDashboard data={data.reliability} days={displayDays} />}
      {section === 'Quality' && <DataHealthDashboard data={data} days={displayDays} />}
    </div>}
  </>
}

function CreatorComparison({ data, reach }: { data: AnalyticsDashboard; reach: AnalyticsDashboard }) {
  const performance = reach.creatorPerformance?.reports.all
  const attribution = data.creatorAttribution
  if (!performance || !attribution) return <Notice>Creator comparison is unavailable.</Notice>
  const posts = new Map(performance.periodCreators.map(row => [row.id, row]))
  const visitors = new Map(attribution.traffic.filter(row => row.creator_id).map(row => [row.creator_id, row.visitors]))
  const revenue = new Map(attribution.summary.filter(row => row.creator_id && row.credit === 'direct' && row.currency === 'USD').map(row => [row.creator_id, row]))
  const excluded = new Set<string>(PERFORMANCE_EXCLUDED_CREATOR_IDS)
  const names = new Map(attribution.creators.filter(row => !excluded.has(String(row.creator_id))).map(row => [String(row.creator_id), String(row.creator)]))
  for (const row of performance.periodCreators) names.set(row.id, row.name)
  const rows = [...names].flatMap(([id, creator]) => {
    const post = posts.get(id)
    const linkVisitors = visitors.get(id)
    const credited = revenue.get(id)
    if (!post && !linkVisitors && !credited) return []
    return [{
      creator, posts: post?.posts ?? null, reported_views: post?.reportedViews ?? null,
      earned_cost: money(post ? post.earnedCents / 100 : null, 'USD'), link_visitors: linkVisitors ?? null,
      paying_customers: credited?.paying_customers ?? null, net_revenue: money(credited?.net, 'USD'),
    }]
  }).sort((a, b) => Number(b.reported_views) - Number(a.reported_views) || Number(b.link_visitors) - Number(a.link_visitors))
  const columns = ['creator', 'posts', 'reported_views', 'earned_cost', 'link_visitors', 'paying_customers', 'net_revenue']
  return <Panel title="Reach, cost and attributed revenue" description="Compare creators side by side across the selected period. Costs and direct revenue are in USD."
    note="Post cohorts use Pacific calendar dates. Link traffic and direct payment credit use the rolling window. Views are the last reported lifetime counts for those posts. The columns describe different events. Experimental creators are excluded from the comparison.">
    <div className="admin-stats-grid">
      <Stat title="Posts submitted" value={count(performance.total.posts)} note="Included creators" />
      <Stat title="Reported views" value={count(performance.total.reportedViews)} note="Lifetime views of the selected posts" />
      <Stat title="Earned creator costs" value={money(performance.total.earnedCents / 100, 'USD')} note="Post earnings · not cash paid" />
      <Stat title="Creators in comparison" value={count(rows.length)} note="Observed reach, traffic or USD revenue" />
    </div>
    <Table rows={rows.slice(0, 20)} columns={columns} />
    {rows.length > 20 && <DataDetails><Table rows={rows} columns={columns} /></DataDetails>}
  </Panel>
}
