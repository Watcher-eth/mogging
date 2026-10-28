import { AnalyticsPreviewLinks } from '@/components/admin/analytics-link'
import { NotificationsDashboard } from '@/components/admin/notifications-dashboard'
import { AttributionLedgerDashboard } from '@/components/admin/attribution-ledger-dashboard'
import { DataHealthDashboard } from '@/components/admin/data-health-dashboard'
import { ReliabilityDashboard } from '@/components/admin/reliability-report'
import { ReferralsDashboard } from '@/components/admin/referrals-dashboard'
import { EngagementDashboard } from '@/components/admin/engagement-dashboard'
import { ScansDashboard } from '@/components/admin/scans-dashboard'
import { PurchaseFlowDashboard } from '@/components/admin/purchase-flow-dashboard'
import { AuthenticationDashboard } from '@/components/admin/authentication-dashboard'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { unstable_cache } from 'next/cache'
import type { GetServerSideProps } from 'next'
import { analyticsFilters, getAnalyticsDashboard, type AnalyticsDashboard } from '@/lib/admin/analytics'
import { isLocalAnalyticsPreview } from '@/lib/admin/local-analytics-preview'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { ProductOverview } from '@/components/admin/product-overview'
import { ExperimentsReport } from '@/components/admin/experiments-report'
import { CreatorEconomicsOverview } from '@/components/admin/creator-economics-overview'
import CreatorPerformanceDashboard from '@/components/admin/creator-performance-dashboard'
import { CreatorAttributionOverview } from '@/components/admin/creator-attribution-overview'
import { RetentionDashboard } from '@/components/admin/retention-dashboard'
import { RevenueDashboard } from '@/components/admin/revenue-dashboard'
import { OnboardingDashboard } from '@/components/admin/onboarding-dashboard'
import { AcquisitionDashboard } from '@/components/admin/acquisition-dashboard'
import { CreatorHeader } from '@/components/creator/creator-shell'
import { AnalyticsSelect } from '@/components/admin/analytics-select'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

// Same read-only aggregates and cache policy as the authenticated dashboard.
const getReport = unstable_cache(getAnalyticsDashboard, ['admin-analytics-pacific-v4'], { revalidate: 60 })
type PreviewProps = { data: AnalyticsDashboard | null; error: string | null }

export default function LocalAnalyticsPreview({ data, error }: PreviewProps) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const targetPath = useRef(router.asPath)
  const inFlight = useRef(0)
  const navigating = useRef(false)
  const notifications = router.query.page === 'notifications'
  const ledger = router.query.page === 'attribution-ledger'
  const health = router.query.page === 'data-health'
  const reliability = router.query.page === 'backend-reliability'
  const acquisition = router.query.page === 'acquisition'
  const experiments = router.query.page === 'experiments'
  const onboarding = router.query.page === 'onboarding'
  const referrals = router.query.page === 'referrals'
  const engagement = router.query.page === 'engagement'
  const scans = router.query.page === 'scans'
  const purchases = router.query.page === 'purchases'
  const authentication = router.query.page === 'authentication'
  const economics = router.query.page === 'creator-economics'
  const performance = router.query.page === 'creator-performance'
  const attribution = router.query.page === 'creator-attribution'
  const retention = router.query.page === 'retention'
  const revenue = router.query.page === 'revenue'
  const days = data?.filters.days ?? (['1','7','30','90'].includes(String(router.query.days)) ? String(router.query.days) : reliability ? '1' : health ? '7' : retention ? '90' : experiments || onboarding || revenue || attribution || performance || economics || authentication || purchases || scans || engagement || referrals || notifications || ledger ? '30' : '7')
  const platform = data?.filters.platform ?? 'all'
  async function update(query = router.query) {
    const parameters = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) parameters.append(key, item)
    }
    targetPath.current = `${router.pathname}?${parameters}`
    inFlight.current++
    setRefreshing(true)
    try { await router.replace(targetPath.current, undefined, { scroll: false }) }
    finally { inFlight.current--; setRefreshing(false) }
  }
  useEffect(() => {
    const routeStart = (url: string) => { targetPath.current = url; navigating.current = true }
    const routeEnd = (url: string) => { if (url === targetPath.current) navigating.current = false }
    const routeError = (_error: unknown, url: string) => { routeEnd(url) }
    router.events.on('routeChangeStart', routeStart)
    router.events.on('routeChangeComplete', routeEnd)
    router.events.on('routeChangeError', routeError)
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || inFlight.current || navigating.current) return
      inFlight.current++
      try { await router.replace(targetPath.current, undefined, { scroll: false }) }
      finally { inFlight.current-- }
    }
    const interval = window.setInterval(() => { void refresh() }, 60_000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', focus)
      router.events.off('routeChangeStart', routeStart)
      router.events.off('routeChangeComplete', routeEnd)
      router.events.off('routeChangeError', routeError)
    }
  }, [router])
  return <AnalyticsPreviewLinks>
    <CreatorHeader eyebrow="Analytics · local preview" title={notifications ? "Notifications" : ledger ? "Attribution ledger" : health ? "Data health" : reliability ? "Backend reliability" : referrals ? "Referrals" : engagement ? "Engagement" : scans ? "Scans" : purchases ? "Purchase flow" : authentication ? "Authentication" : economics ? "Creator economics" : performance ? "Creator performance" : attribution ? "Creator attribution" : retention ? "Retention" : revenue ? "Revenue" : onboarding ? "Onboarding" : experiments ? "A/B tests" : acquisition ? "Acquisition" : "Product overview"} description={notifications ? "Notification registrations, reminder activity, and customer engagement." : ledger ? "Audit creator credit records by attribution model and currency." : health ? "Data ingestion, processing queues, and reporting coverage." : reliability ? "Recorded backend operations, technical issues, and evaluation follow-up." : referrals ? "Credited signups, referred customer outcomes, and scan rewards." : engagement ? "Meaningful product use, feature adoption, and completed actions." : scans ? "Completed evaluations, request reliability, and report availability." : purchases ? "Purchase attempts, billing confirmation, and access activation." : authentication ? "Sign-in activity, authentication issues, and account continuity." : economics ? "Attributed revenue, creator compensation, and acquisition measurement." : performance ? "Content reach, earned creator costs, and post payouts." : attribution ? "Creator-driven traffic, paying customers, and attributed revenue." : retention ? "Customer return rates, cohort trends, and subscriber engagement." : revenue ? "Revenue, customer payments, and subscription activity." : onboarding ? "Completion, screen progression, and drop-off across mobile onboarding." : experiments ? "Compare mature outcomes for the active homepage test." : acquisition ? "Traffic sources, store interest, and first app opens." : "Customer activity, completed scans, and paid report delivery."} />
    <p className="admin-notice">Real analytics from the configured database · read-only · available only on this computer in development. Detailed admin pages still require sign-in.</p>
    <div className="admin-report-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsSelect label="Period" value={days} onChange={value => { void update({ ...router.query, days: value }) }} options={['1','7','30','90'].map(value => ({value, label:value === '1' ? performance ? 'Today' : 'Last 24 hours' : `Last ${value} days`}))} />
        {!notifications && !ledger && !health && !reliability && !experiments && !revenue && !attribution && !performance && !economics && !scans && !referrals ? <AnalyticsSelect label="Platform" value={platform} onChange={value => { void update({ ...router.query, platform: value }) }} options={[{value:'all',label:'All platforms'},{value:'ios',label:'iOS'},{value:'android',label:'Android'},...(!purchases && !onboarding ? [{value:'web',label:'Web'}] : [])]} /> : null}
        <Button variant="ghost" aria-label="Refresh analytics" disabled={refreshing} onClick={() => { void update() }}><RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} /></Button>
      </div>
      <span className="text-xs text-zinc-500">{data ? `Snapshot ${formatReportingTime(data.generatedAt, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}` : 'No snapshot available'} · Real data</span>
    </div>
    {error ? <p role="alert" className="admin-notice">{error}</p> : null}
    {data ? notifications ? <NotificationsDashboard data={data} days={Number(days)} /> : ledger ? <AttributionLedgerDashboard data={data} days={Number(days)} /> : health ? <DataHealthDashboard data={data} days={Number(days)} /> : reliability ? data.reliability ? <ReliabilityDashboard data={data.reliability} days={Number(days)} /> : null : referrals ? <ReferralsDashboard data={data} days={Number(days)} /> : engagement ? <EngagementDashboard data={data} days={Number(days)} /> : scans ? <ScansDashboard data={data} days={Number(days)} /> : purchases ? <PurchaseFlowDashboard data={data} days={Number(days)} /> : authentication ? <AuthenticationDashboard data={data} days={Number(days)} /> : economics ? <CreatorEconomicsOverview data={data} days={Number(days)} /> : performance ? <CreatorPerformanceDashboard data={data} attributionHref="/admin/__product-overview-preview?page=creator-attribution&days=30&platform=all" /> : attribution ? <CreatorAttributionOverview data={data} days={Number(days)} /> : retention ? <RetentionDashboard data={data} days={Number(days)} /> : revenue ? <RevenueDashboard data={data} days={Number(days)} /> : onboarding ? <OnboardingDashboard data={data} days={Number(days)} /> : experiments ? <ExperimentsReport data={data} /> : acquisition ? <AcquisitionDashboard data={data} days={Number(days)} /> : <ProductOverview data={data} days={Number(days)} /> : null}
  </AnalyticsPreviewLinks>
}

export const getServerSideProps: GetServerSideProps<PreviewProps> = async ({ req, res, query }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  if (!isLocalAnalyticsPreview(process.env.NODE_ENV, req.headers, req.socket.remoteAddress)) return { notFound: true }
  if (query.page !== undefined && (typeof query.page !== 'string' || !['overview', 'acquisition', 'experiments', 'onboarding', 'revenue', 'retention', 'creator-attribution', 'creator-performance', 'creator-economics', 'authentication', 'purchases', 'scans', 'engagement', 'referrals', 'notifications', 'attribution-ledger', 'data-health', 'backend-reliability'].includes(query.page))) return { notFound: true }
  const section = query.page === 'notifications' ? 'Notifications' : query.page === 'attribution-ledger' ? 'AttributionLedger' : query.page === 'data-health' ? 'Quality' : query.page === 'backend-reliability' ? 'Reliability' : query.page === 'referrals' ? 'Referrals' : query.page === 'engagement' ? 'Engagement' : query.page === 'scans' ? 'Scans' : query.page === 'purchases' ? 'Purchases' : query.page === 'authentication' ? 'Authentication' : query.page === 'creator-economics' ? 'CreatorEconomics' : query.page === 'creator-performance' ? 'CreatorPerformance' : query.page === 'creator-attribution' ? 'CreatorAttribution' : query.page === 'retention' ? 'Retention' : query.page === 'revenue' ? 'Revenue' : query.page === 'onboarding' ? 'Onboarding' : query.page === 'experiments' ? 'Experiments' : query.page === 'acquisition' ? 'Acquisition' : 'Overview'
  const filters = analyticsFilters.safeParse({ days: query.days ?? (section === 'Reliability' ? '1' : section === 'Quality' ? '7' : section === 'Retention' ? '90' : ['Experiments', 'Onboarding', 'Revenue', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Authentication', 'Purchases', 'Scans', 'Engagement', 'Referrals', 'Notifications', 'AttributionLedger'].includes(section) ? '30' : '7'), platform: ['Experiments', 'Revenue', 'CreatorAttribution', 'CreatorPerformance', 'CreatorEconomics', 'Scans', 'Referrals', 'Notifications', 'AttributionLedger', 'Quality', 'Reliability'].includes(section) ? 'all' : ['Onboarding','Purchases'].includes(section) && query.platform === 'web' ? 'all' : query.platform, section })
  if (!filters.success) return { notFound: true }
  try {
    const data = await getReport(filters.data)
    // Ensure the preview exposes only the aggregates it renders.
    return { props: { data: {
      generatedAt: data.generatedAt, queryMs: data.queryMs, filters: data.filters,
      summary: data.summary, daily: data.daily, scanLedger: data.scanLedger,
      paidDelivery: data.paidDelivery ?? [], audienceBreakdown: data.audienceBreakdown ?? [],
      ...(section === 'Notifications' ? { notifications: data.notifications } : {}),
      ...(section === 'AttributionLedger' ? { attributionLedger: data.attributionLedger } : {}),
      ...(section === 'Quality' ? { dataHealth: data.dataHealth } : {}),
      ...(section === 'Reliability' ? { reliability: data.reliability } : {}),
      ...(section === 'Referrals' ? { referrals: data.referrals } : {}),
      ...(section === 'Engagement' ? { engagement: data.engagement } : {}),
      ...(section === 'Scans' ? { scans: data.scans } : {}),
      ...(section === 'Purchases' ? { purchaseFlow: data.purchaseFlow } : {}),
      ...(section === 'Authentication' ? { authentication: data.authentication } : {}),
      ...(section === 'CreatorEconomics' ? { creatorEconomics: data.creatorEconomics } : {}),
      ...(section === 'CreatorPerformance' ? { creatorPerformance: data.creatorPerformance } : {}),
      ...(section === 'CreatorAttribution' ? { creatorAttribution: data.creatorAttribution } : {}),
      ...(section === 'Retention' ? { retention: data.retention, retentionWeekly: data.retentionWeekly ?? [], retentionCoverage: data.retentionCoverage ?? [], featureRetention: data.featureRetention ?? [], membershipActivation: data.membershipActivation ?? [] } : {}),
      ...(section === 'Revenue' ? {
        revenue: data.revenue, revenueTotals: data.revenueTotals ?? [], revenueDaily: data.revenueDaily,
        revenueActivity: data.revenueActivity ?? [], revenueComparison: data.revenueComparison ?? [],
        billingReporting: data.billingReporting ?? [], billingProducts: data.billingProducts,
        billingDimensions: data.billingDimensions, billing: data.billing,
      } : {}),
      ...(section === 'Onboarding' ? {
        onboardingSummary: data.onboardingSummary ?? [], onboardingDaily: data.onboardingDaily ?? [],
        onboarding: data.onboarding, onboardingScreens: data.onboardingScreens,
        onboardingRevisions: data.onboardingRevisions, onboardingFriction: data.onboardingFriction,
        steps: data.steps, screens: data.screens, eventMetrics: data.eventMetrics,
        eventPlatforms: data.eventPlatforms, dimensions: data.dimensions, contextCoverage: data.contextCoverage,
      } : {}),
      ...(section === 'Experiments' ? { landingExperiments: data.landingExperiments, landingExperimentDaily: data.landingExperimentDaily ?? [], landingHandoffs: data.landingHandoffs ?? [] } : {}),
      ...(section === 'Acquisition' ? {
        acquisition: data.acquisition, acquisitionSummary: data.acquisitionSummary ?? [],
        landingSummary: data.landingSummary ?? [], landingSources: data.landingSources,
        landingSections: data.landingSections, landingPlacements: data.landingPlacements,
        webAudience: data.webAudience ?? [], eventMetrics: data.eventMetrics,
        eventPlatforms: data.eventPlatforms, dimensions: data.dimensions, contextCoverage: data.contextCoverage,
      } : {}),
    } as AnalyticsDashboard, error: null } }
  } catch (error) {
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error
    console.error('Local analytics snapshot failed:', cause instanceof Error ? cause.message : 'Unknown error')
    return { props: { data: null, error: 'The database analytics snapshot could not load. Try Refresh; unavailable data is not shown as zero.' } }
  }
}
