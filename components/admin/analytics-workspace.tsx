import { WEB_FLOW_VERSION } from '@/lib/analytics/web-context'
import { webJourneyDimensions } from '@/lib/analytics/web-context'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import { AdminPasswordGate } from './admin-password-gate'
import { CreatorHeader } from '@/components/creator/creator-header'
import { Button } from '@/components/ui/button'
import { apiGet, ApiClientError } from '@/lib/api/client'
import { adminPage } from '@/lib/admin/navigation'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { AnalyticsSelect } from './analytics-select'
import { ProductOverview } from './product-overview'
import { Notice, label } from './analytics-ui'

function ReportLoading() {
  return <Notice>Loading reporting snapshot…</Notice>
}

const NotificationsDashboard = dynamic(() => import('./notifications-dashboard').then(module => module.NotificationsDashboard), { loading: ReportLoading })
const AttributionLedgerDashboard = dynamic(() => import('./attribution-ledger-dashboard').then(module => module.AttributionLedgerDashboard), { loading: ReportLoading })
const DataHealthDashboard = dynamic(() => import('./data-health-dashboard').then(module => module.DataHealthDashboard), { loading: ReportLoading })
const ReferralsDashboard = dynamic(() => import('./referrals-dashboard').then(module => module.ReferralsDashboard), { loading: ReportLoading })
const EngagementDashboard = dynamic(() => import('./engagement-dashboard').then(module => module.EngagementDashboard), { loading: ReportLoading })
const ScansDashboard = dynamic(() => import('./scans-dashboard').then(module => module.ScansDashboard), { loading: ReportLoading })
const AuthenticationDashboard = dynamic(() => import('./authentication-dashboard').then(module => module.AuthenticationDashboard), { loading: ReportLoading })
const WebJourneyDashboard = dynamic(() => import('./web-journey-dashboard').then(module => module.WebJourneyDashboard), { loading: ReportLoading })
const PurchaseFlowDashboard = dynamic(() => import('./purchase-flow-dashboard').then(module => module.PurchaseFlowDashboard), { loading: ReportLoading })
const ExperimentsReport = dynamic(() => import('./experiments-report').then(module => module.ExperimentsReport), { loading: ReportLoading })
const ReliabilityDashboard = dynamic(() => import('./reliability-report').then(module => module.ReliabilityDashboard), { loading: ReportLoading })
const AcquisitionDashboard = dynamic(() => import('./acquisition-dashboard').then(module => module.AcquisitionDashboard), { loading: ReportLoading })
const OnboardingDashboard = dynamic(() => import('./onboarding-dashboard').then(module => module.OnboardingDashboard), { loading: ReportLoading })
const CreatorEconomicsOverview = dynamic(() => import('./creator-economics-overview').then(module => module.CreatorEconomicsOverview), { loading: ReportLoading })
const CreatorPerformanceDashboard = dynamic(() => import('./creator-performance-dashboard'), { loading: ReportLoading })
const CreatorAttributionOverview = dynamic(() => import('./creator-attribution-overview').then(module => module.CreatorAttributionOverview), { loading: ReportLoading })
const RetentionDashboard = dynamic(() => import('./retention-dashboard').then(module => module.RetentionDashboard), { loading: ReportLoading })
const RevenueDashboard = dynamic(() => import('./revenue-dashboard').then(module => module.RevenueDashboard), { loading: ReportLoading })

export default function AnalyticsAdminPage() {
  const router = useRouter()
  const page = adminPage(router.pathname)
  const tab = page?.section || 'Overview'
  const days = ['1', '7', '14', '30', '90'].includes(String(router.query.days)) ? String(router.query.days) : tab === 'WebJourney' ? '14' : ['Reliability', 'Revenue'].includes(tab) ? '1' : tab === 'Quality' ? '7' : tab === 'Retention' ? '90' : ['Experiments', 'Onboarding', 'Revenue', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? '30' : '7'
  const platform = tab === 'WebJourney' ? 'all' : ['Onboarding','Purchases'].includes(tab) && router.query.platform === 'web' ? 'all' : ['Experiments', 'Revenue', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Scans', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? 'all' : ['all', 'web', 'ios', 'android'].includes(String(router.query.platform)) ? String(router.query.platform) : 'all'
  const webVersion = typeof router.query.webVersion === 'string' ? router.query.webVersion : WEB_FLOW_VERSION
  const webDimension = webJourneyDimensions.includes(router.query.webDimension as typeof webJourneyDimensions[number]) ? String(router.query.webDimension) : 'channel'
  const webQuery = tab === 'WebJourney' ? `&webVersion=${encodeURIComponent(webVersion)}&webDimension=${webDimension}` : ''
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet, { shouldRetryOnError: false })
  const report = useSWR<AnalyticsDashboard>(access.data?.unlocked ? `/api/admin/analytics?days=${days}&platform=${platform}&section=${tab}${webQuery}` : null, apiGet,
    { dedupingInterval: 60_000, refreshInterval: ['WebJourney', 'Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? 60_000 : 0, revalidateOnFocus: ['WebJourney', 'Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab), shouldRetryOnError: false })
  const expired = report.error instanceof ApiClientError && report.error.status === 401
  if (access.error) return <Notice>Admin access could not be verified. Reload or sign in with an authorized account.</Notice>
  if (access.isLoading) return <Notice>Checking admin access…</Notice>
  if (!access.data?.unlocked || expired) return <AdminPasswordGate onUnlocked={() => { void access.mutate(); void report.mutate() }} />
  const data = report.data
  const filter = (key: 'days' | 'platform' | 'webVersion' | 'webDimension', value: string) => {
    void router.replace({ pathname: router.pathname, query: { days, platform, ...(tab === 'WebJourney' ? { webVersion, webDimension } : {}), [key]: value } }, undefined, { shallow: true })
  }
  const refresh = () => { void report.mutate() }
  return <>
    <CreatorHeader eyebrow="Analytics" title={page?.title || 'Product overview'} description={page?.description || 'Understand daily activity and the path to value.'} />
    <div className="admin-report-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsSelect label="Period" value={days} onChange={value => filter('days', value)} options={[1,7,14,30,90].map(day => ({value:String(day),label:day === 1 ? tab === 'CreatorPerformance' ? "Today" : "Last 24 hours" : `Last ${day} days`}))} />
        {!['WebJourney','Reliability','Experiments','Revenue','CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Scans', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab)?<AnalyticsSelect label={['Onboarding', 'Purchases'].includes(tab) ? "App diagnostics" : "Platform"} value={platform} onChange={value => filter('platform', value)} options={(['Onboarding','Purchases'].includes(tab) ? ['all','ios','android'] : ['all','web','ios','android']).map(value => ({value,label:value === 'all' ? 'All platforms' : value === 'ios' ? 'iOS' : label(value)}))}/>:null}
        {tab === 'WebJourney' ? <><AnalyticsSelect label="Tracking version" value={webVersion} onChange={value => filter('webVersion', value)} options={[...new Set([WEB_FLOW_VERSION, ...(data?.webJourney?.versions.map(row => String(row.version)) || [])])].map(value => ({ value, label: value === WEB_FLOW_VERSION ? 'Current tracking' : value === 'legacy' ? 'Legacy · incomplete' : value }))} /><AnalyticsSelect label="Breakdown" value={webDimension} onChange={value => filter('webDimension', value)} options={webJourneyDimensions.map(value => ({ value, label: label(value) }))} /></> : null}
        <Button variant="ghost" className="size-10 p-0 text-[#73777d]" aria-label="Refresh analytics" disabled={report.isValidating} onClick={refresh}><RefreshCw className={`size-4 ${report.isValidating ? 'animate-spin' : ''}`} /></Button>
      </div>
      <p className="text-xs text-[#858a91]" aria-live="polite">{data ? `${['WebJourney', 'Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? 'Snapshot' : 'Updated'} ${formatReportingTime(new Date(data.generatedAt), { ...(['WebJourney', 'Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? { month: 'short', day: 'numeric' } as const : {}), hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : 'Pacific-time reporting'} · {['Notifications','Reliability','Quality'].includes(tab) ? 'Operational data' : 'Production'}</p>
    </div>
    {report.error ? <Notice>{['WebJourney', 'Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) && data ? 'The latest snapshot could not load. Showing the previous snapshot with its original timestamps.' : 'Analytics could not load. Missing data is never shown as zero.'} <button className="underline" onClick={() => void report.mutate()}>Try again</button>.</Notice> : null}
    {!data ? !report.error ? <Notice>Loading reporting snapshot…</Notice> : null : <>
      {tab === 'Overview' ? <ProductOverview data={data} days={Number(days)} /> : null}
      {tab === 'Experiments' ? <ExperimentsReport data={data} /> : null}
      {tab === 'Acquisition' ? <AcquisitionDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Onboarding' ? <OnboardingDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Authentication' ? <AuthenticationDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Revenue' ? <RevenueDashboard data={data} days={Number(days)} /> : null}
      {tab === 'CreatorEconomics' ? <CreatorEconomicsOverview data={data} days={Number(days)} /> : null}
      {tab === 'CreatorPerformance' ? <CreatorPerformanceDashboard data={data} /> : null}
      {tab === 'CreatorAttribution' ? <CreatorAttributionOverview data={data} days={Number(days)} /> : null}
      {tab === 'Retention' ? <RetentionDashboard data={data} days={Number(days)} /> : null}
      {tab === 'WebJourney' ? <WebJourneyDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Purchases' ? <PurchaseFlowDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Scans' ? <ScansDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Engagement' ? <EngagementDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Referrals' ? <ReferralsDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Notifications' ? <NotificationsDashboard data={data} days={Number(days)} /> : null}
      {tab === 'AttributionLedger' ? <AttributionLedgerDashboard data={data} days={Number(days)} /> : null}
      {tab === 'Reliability' && data.reliability ? <ReliabilityDashboard data={data.reliability} days={Number(days)} /> : null}
      {tab === 'Quality' ? <DataHealthDashboard data={data} days={Number(days)} /> : null}
    </>}
  </>
}
