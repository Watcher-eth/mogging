import { NotificationsDashboard } from './notifications-dashboard'
import { AttributionLedgerDashboard } from './attribution-ledger-dashboard'
import { DataHealthDashboard } from './data-health-dashboard'
import { ReferralsDashboard } from './referrals-dashboard'
import { EngagementDashboard } from './engagement-dashboard'
import { ScansDashboard } from './scans-dashboard'
import { AuthenticationDashboard } from './authentication-dashboard'
import { PurchaseFlowDashboard } from './purchase-flow-dashboard'
import { ExperimentsReport } from './experiments-report'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { RefreshCw } from 'lucide-react'
import { AdminPasswordGate } from './admin-password-gate'
import { CreatorHeader } from '@/components/creator/creator-shell'
import { Button } from '@/components/ui/button'
import { apiGet, ApiClientError } from '@/lib/api/client'
import { adminPage } from '@/lib/admin/navigation'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { AnalyticsSelect } from './analytics-select'
import { ReliabilityDashboard } from './reliability-report'
import { ProductOverview } from './product-overview'
import { AcquisitionDashboard } from './acquisition-dashboard'
import { OnboardingDashboard } from './onboarding-dashboard'
import { CreatorEconomicsOverview } from './creator-economics-overview'
import CreatorPerformanceDashboard from './creator-performance-dashboard'
import { CreatorAttributionOverview } from './creator-attribution-overview'
import { RetentionDashboard } from './retention-dashboard'
import { RevenueDashboard } from './revenue-dashboard'
import { Notice, label } from './analytics-ui'

export default function AnalyticsAdminPage() {
  const router = useRouter()
  const page = adminPage(router.pathname)
  const tab = page?.section || 'Overview'
  const days = ['1', '7', '30', '90'].includes(String(router.query.days)) ? String(router.query.days) : tab === 'Reliability' ? '1' : tab === 'Quality' ? '7' : tab === 'Retention' ? '90' : ['Experiments', 'Onboarding', 'Revenue', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? '30' : '7'
  const platform = ['Onboarding','Purchases'].includes(tab) && router.query.platform === 'web' ? 'all' : ['Experiments', 'Revenue', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Scans', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? 'all' : ['all', 'web', 'ios', 'android'].includes(String(router.query.platform)) ? String(router.query.platform) : 'all'
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet, { shouldRetryOnError: false })
  const report = useSWR<AnalyticsDashboard>(access.data?.unlocked ? `/api/admin/analytics?days=${days}&platform=${platform}&section=${tab}` : null, apiGet,
    { dedupingInterval: 60_000, refreshInterval: ['Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? 60_000 : 0, revalidateOnFocus: ['Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab), shouldRetryOnError: false })
  const expired = report.error instanceof ApiClientError && report.error.status === 401
  if (access.error) return <Notice>Admin access could not be verified. Reload or sign in with an authorized account.</Notice>
  if (access.isLoading) return <Notice>Checking admin access…</Notice>
  if (!access.data?.unlocked || expired) return <AdminPasswordGate onUnlocked={() => { void access.mutate(); void report.mutate() }} />
  const data = report.data
  const filter = (key: 'days' | 'platform', value: string) => {
    void router.replace({ pathname: router.pathname, query: { days, platform, [key]: value } }, undefined, { shallow: true })
  }
  const refresh = () => { void report.mutate() }
  return <>
    <CreatorHeader eyebrow="Analytics" title={page?.title || 'Product overview'} description={page?.description || 'Understand daily activity and the path to value.'} />
    <div className="admin-report-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsSelect label="Period" value={days} onChange={value => filter('days', value)} options={[1,7,30,90].map(day => ({value:String(day),label:day === 1 ? tab === 'CreatorPerformance' ? "Today" : "Last 24 hours" : `Last ${day} days`}))} />
        {!['Reliability','Experiments','Revenue','CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Scans', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab)?<AnalyticsSelect label="Platform" value={platform} onChange={value => filter('platform', value)} options={(['Onboarding','Purchases'].includes(tab) ? ['all','ios','android'] : ['all','web','ios','android']).map(value => ({value,label:value === 'all' ? 'All platforms' : value === 'ios' ? 'iOS' : label(value)}))}/>:null}
        <Button variant="ghost" className="size-10 p-0 text-[#73777d]" aria-label="Refresh analytics" disabled={report.isValidating} onClick={refresh}><RefreshCw className={`size-4 ${report.isValidating ? 'animate-spin' : ''}`} /></Button>
      </div>
      <p className="text-xs text-[#858a91]" aria-live="polite">{data ? `${['Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? 'Snapshot' : 'Updated'} ${formatReportingTime(new Date(data.generatedAt), { ...(['Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) ? { month: 'short', day: 'numeric' } as const : {}), hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : 'Pacific-time reporting'} · {['Notifications','Reliability','Quality'].includes(tab) ? 'Operational data' : 'Production'}</p>
    </div>
    {report.error ? <Notice>{['Overview', 'Acquisition', 'Experiments', 'Onboarding', 'Revenue', 'Retention', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(tab) && data ? 'The latest snapshot could not load. Showing the previous snapshot with its original timestamps.' : 'Analytics could not load. Missing data is never shown as zero.'} <button className="underline" onClick={() => void report.mutate()}>Try again</button>.</Notice> : null}
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
