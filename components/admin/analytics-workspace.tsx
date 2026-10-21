import { PurchaseAttemptsReportView } from './purchase-attempts-report';
import { ExperimentsReport } from './experiments-report'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react'
import { AdminPasswordGate } from './admin-password-gate'
import { CreatorHeader } from '@/components/creator/creator-shell'
import { Button } from '@/components/ui/button'
import { apiGet, ApiClientError } from '@/lib/api/client'
import { adminPage } from '@/lib/admin/navigation'
import { onboardingScreenRows, retentionRates } from '@/lib/admin/chart-data'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import dynamic from 'next/dynamic'
const DistributionChart = dynamic(() => import('./category-chart').then(module => module.DistributionChart), { ssr: false })
import { AnalyticsChart, chartColors as colors, type ChartMetric } from './analytics-chart'
import { EventReport, DimensionReport, TrackingCoverage } from './tracking-report'
import { OperationalReport } from './operational-report'
import { AnalyticsSelect } from './analytics-select'
import { ReliabilityReport } from './reliability-report'
import { Bars, ComparisonBars, DataDetails, Notice, Panel, Stat, Table, count, label, money, percent } from './analytics-ui'

const activityMetrics: ChartMetric[] = [
  { key: 'actors', label: 'Active devices', color: colors.blue },
  { key: 'evaluations', label: 'Completed scans', color: colors.violet },
]
const acquisitionMetrics: ChartMetric[] = [
  { key: 'first_opens', label: 'First app opens', color: colors.blue },
  { key: 'store_redirects', label: 'Store redirects', color: colors.violet },
]
const onboardingMetrics: ChartMetric[] = [
  { key: 'paywall_views', label: 'Paywall views', color: colors.blue },
  { key: 'purchase_starts', label: 'Purchase starts', color: colors.violet },
  { key: 'purchase_completions', label: 'Completions', color: colors.green },
]
const valueMetrics: ChartMetric[] = [
  { key: 'report_views', label: 'Report views', color: colors.blue },
  { key: 'protocol_tasks', label: 'Protocol tasks', color: colors.green },
  { key: 'course_learners', label: 'Course learners', color: colors.violet },
  { key: 'progress_users', label: 'Progress users', color: colors.orange },
]
const revenueMetrics: ChartMetric[] = [
  { key: 'gross', label: 'Gross', color: colors.blue },
  { key: 'refunds', label: 'Refunds', color: colors.orange },
  { key: 'net', label: 'Net', color: colors.green },
]
const qualityMetrics: ChartMetric[] = [{ key: 'failures', label: 'Scan failures', color: colors.orange }]
const operationalSections = ['Authentication','Purchases','Scans','Referrals','Notifications','AttributionLedger']
const observationNote = 'Counts are observed events per UTC bucket, except active devices and first app opens which are distinct devices. Buckets with no recorded events are omitted; a gap does not establish zero users or an outage. Boundary buckets are partial. Purchase completion is a client signal, not verified billing.'
type Health = { pending_events: number; pending_billing_events: number; unfinished_webhooks: number;
  oldest_pending_event: string | null; last_revenuecat_receipt: string | null; last_stripe_receipt: string | null;
  unrecorded_stripe_purchases: number;
  stripe_reconciliation: { checked_at: string; webhook_ready: boolean | null; events_checked: number } | null;
  configured: Record<string, boolean> }

export default function AnalyticsAdminPage() {
  const router = useRouter()
  const page = adminPage(router.pathname)
  const tab = page?.section || 'Overview'
  const { mutate } = useSWRConfig()
  const days = ['1', '7', '30', '90'].includes(String(router.query.days)) ? String(router.query.days) : '30'
  const platform = tab === 'Experiments' ? 'all' : ['all', 'web', 'ios', 'android'].includes(String(router.query.platform)) ? String(router.query.platform) : 'all'
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet, { shouldRetryOnError: false })
  const report = useSWR<AnalyticsDashboard>(access.data?.unlocked && tab !== 'Reliability' ? `/api/admin/analytics?days=${days}&platform=${platform}` : null, apiGet,
    { dedupingInterval: 60_000, revalidateOnFocus: false, shouldRetryOnError: false })
  const expired = report.error instanceof ApiClientError && report.error.status === 401
  if (access.error) return <Notice>Admin access could not be verified. Reload or sign in with an authorized account.</Notice>
  if (access.isLoading) return <Notice>Checking admin access…</Notice>
  if (!access.data?.unlocked || expired) return <AdminPasswordGate onUnlocked={() => { void access.mutate(); void report.mutate() }} />
  const data = report.data
  const filter = (key: 'days' | 'platform', value: string) => {
    void router.replace({ pathname: router.pathname, query: { days, platform, [key]: value } }, undefined, { shallow: true })
  }
  const refresh = () => {
    if (tab === 'Reliability') { void mutate(`/api/admin/reliability?days=${days}`); return }
    void report.mutate()
    if (tab === 'Purchases') void mutate(`/api/admin/purchase-attempts?days=${days}&platform=${platform}`)
    if (operationalSections.includes(tab)) void mutate(`/api/admin/analytics-operations?days=${days}&section=${tab}`)
    if (tab === 'Quality') void mutate('/api/admin/analytics-health')
  }
  return <>
    <CreatorHeader eyebrow="Analytics" title={page?.title || 'Product overview'} description={page?.description || 'Understand daily activity and the path to value.'} />
    <div className="admin-report-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsSelect label="Period" value={days} onChange={value => filter('days', value)} options={[1,7,30,90].map(day => ({value:String(day),label:day === 1 ? "Last 24 hours" : `Last ${day} days`}))} />
        {!['Reliability','Experiments','Revenue'].includes(tab)?<AnalyticsSelect label="Platform" value={platform} onChange={value => filter('platform', value)} options={['all','web','ios','android'].map(value => ({value,label:value === 'all' ? 'All platforms' : value === 'ios' ? 'iOS' : label(value)}))}/>:null}
        <Button variant="ghost" className="size-10 p-0 text-[#73777d]" aria-label="Refresh analytics" disabled={report.isValidating} onClick={refresh}><RefreshCw className={`size-4 ${report.isValidating ? 'animate-spin' : ''}`} /></Button>
      </div>
      <p className="text-xs text-[#858a91]" aria-live="polite">{data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })} UTC` : 'UTC reporting'} · Production</p>
    </div>
    {report.error ? <Notice>Analytics could not load. <button className="underline" onClick={() => void report.mutate()}>Try again</button>. Missing data is never shown as zero.</Notice> : null}
    {tab === 'Reliability'?<ReliabilityReport days={Number(days)}/>:!data ? !report.error ? <Notice>Loading reporting snapshot…</Notice> : null : <>
      {!data.summary.events ? <Notice>No production behavior events in this window. Check ingestion and the released app version; billing may still be available.</Notice> : null}
      <p className="mb-5 text-xs leading-5 text-zinc-500">Customer activity excludes creator/admin pages, explicitly marked internal accounts and known sandbox sessions. Older activity without runtime evidence remains included.</p>
      {data.audienceBreakdown ? <DataDetails><Table rows={data.audienceBreakdown} columns={['audience','devices','events','runtime_unconfirmed_events']} /></DataDetails> : null}
      {tab === 'Overview' ? <Overview data={data} days={Number(days)} /> : null}
      {tab === 'Experiments' ? <ExperimentsReport data={data} /> : null}
      {tab === 'Acquisition' ? <Acquisition data={data} days={Number(days)} /> : null}
      {tab === 'Onboarding' ? <Onboarding data={data} days={Number(days)} /> : null}
      {tab === 'Revenue' ? <Revenue data={data} days={Number(days)} /> : null}
      {tab === 'Retention' ? <Retention data={data} days={Number(days)} /> : null}
      {tab === 'Purchases' ? <PaidDelivery data={data} /> : null}
      {['Authentication','Purchases','Scans','Engagement','Referrals','Notifications','AttributionLedger'].includes(tab) ? <Activity data={data} days={Number(days)} section={tab} /> : null}
      {tab === 'Quality' ? <Quality data={data} days={Number(days)} /> : null}
    </>}
  </>
}
function Activity({ data, days, section }: { data: AnalyticsDashboard; days: number; section: string }) {
  const daily = section === 'Scans' ? [{ key: 'scan_starts', label: 'Scans started', color: colors.ink }, { key: 'evaluations', label: 'Completed', color: colors.blue }, { key: 'failures', label: 'Failed', color: colors.orange }]
    : section === 'Purchases' ? onboardingMetrics : section === 'Engagement' ? valueMetrics
    : section === 'Authentication' ? [{key:'auth_starts',label:'Sign-in starts',color:colors.ink},{key:'auth_successes',label:'Authenticated',color:colors.blue},{key:'auth_failures',label:'Auth errors',color:colors.orange},{key:'auth_cancellations',label:'Cancelled',color:colors.violet},{key:'post_login_failures',label:'Post-login errors',color:colors.green}]
    : section === 'Referrals' ? [{key:'referral_invites',label:'Invites created',color:colors.blue},{key:'referral_redemptions',label:'Invites redeemed',color:colors.green}]
    : section === 'Notifications' ? [{key:'push_opens',label:'Push opens',color:colors.blue}] : null
  return <>
    {section === 'Engagement' ? <FeatureUsage data={data} /> : null}
    {section === 'Scans' ? <>
      <StoredReports data={data} days={days} />
      <div className="admin-stats-grid">
        <Stat title="Confirmed evaluations" value={count(data.scanLedger.summary.completed)} note="Completed credit reservations" />
        <Stat title="Saved reports" value={count(data.scanLedger.summary.reports)} note="Distinct report IDs in completed reservations" />
        <Stat title="Returned scans" value={count(data.scanLedger.summary.failed)} note="Failed reservations return their credit" />
        <Stat title="Processing" value={count(data.scanLedger.summary.pending)} note="Reservations still pending" />
      </div>
      <Panel title="Scan credit ledger" description="Backend-confirmed credit usage across all platforms, including free credits." note="Independent of client analytics and the platform filter. Known sandbox purchases are excluded. Counts by reservation start time in UTC; a new evaluation of the same image can update an existing report.">
        <AnalyticsChart rows={data.scanLedger.daily} metrics={[{key:'completed',label:'Completed',color:colors.blue},{key:'failed',label:'Credit returned',color:colors.orange},{key:'pending',label:'Pending',color:colors.violet}]} days={days} title="Scan credit ledger" />
        <DataDetails><Table rows={data.scanLedger.daily} columns={['day','started','completed','failed','pending']} /></DataDetails>
      </Panel>
    </> : null}
    {section === 'Authentication' ? <p className="mb-5 text-sm text-[#73777d]">Older app releases combine cancellations and setup errors with auth failures. Updated releases report these outcomes separately; historical events retain their original classification.</p> : null}
    {daily ? <DailyChart data={data} days={days} title={section === 'Scans' ? 'Client-observed scan outcomes' : section === 'Purchases' ? 'Paywall activity' : section === 'Authentication' ? 'Authentication outcomes' : section === 'Referrals' ? 'Referral activity' : section === 'Notifications' ? 'Notification engagement' : 'Value-building activity'} metrics={daily} /> : null}
    {section === 'Purchases' ? <><Funnel title="Paywall conversion" rows={data.paywall} /><PurchaseAttemptsReportView days={days} platform={data.filters.platform} /></> : null}
    {section !== 'AttributionLedger' ? <EventReport data={data} section={section as 'Authentication' | 'Purchases' | 'Scans' | 'Engagement' | 'Referrals' | 'Notifications'} /> : null}
    {operationalSections.includes(section) ? <OperationalReport days={days} section={section} /> : null}
  </>
}
function DailyChart({ data, days, title, metrics }: { data: AnalyticsDashboard; days: number; title: string; metrics: ChartMetric[] }) {
  return <Panel title={title} description={days === 1 ? "Hourly observations · UTC · boundary hours are partial" : "Daily observations · UTC · today is partial"} note={observationNote}>
    <AnalyticsChart rows={data.daily} metrics={metrics} days={days} title={title} />
    <DataDetails><Table rows={data.daily} columns={['day', ...metrics.map(metric => metric.key)]} /></DataDetails>
  </Panel>
}
function Overview({ data, days }: { data: AnalyticsDashboard; days: number }) {
  return <>
    <div className="admin-stats-grid">
      <Stat title="Active devices" value={count(data.summary.actors)} note="Customer devices / browsers; creator and admin pages excluded" />
      <Stat title="First app opens" value={count(data.summary.first_opens)} note="Observed new installations" />
      <Stat title="Completed scans" value={count(data.summary.evaluations)} note="Client-observed completions" />
      <Stat title="Scan failures" value={count(data.summary.failures)} note="Events, not a cohort failure rate" />
    </div>
    <StoredReports data={data} days={days} />
    <PaidDelivery data={data} />
    <DailyChart data={data} days={days} title="Product activity" metrics={activityMetrics} />
    <div className="admin-section-grid"><Funnel title="Mobile activation" rows={data.onboarding} /><Funnel title="Paywall conversion" rows={data.paywall} /></div>
  </>
}
function StoredReports({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const ledger = data.reportLedger
  return <Panel title="Stored user reports" description="Customer report records across all platforms; examples, known sandbox and internal checks excluded." note="Counts by report creation time in UTC. Reports can be updated or reused, so they are not scan attempts. Known sandbox credits, explicitly internal accounts and release checks are excluded. Older reports without provenance remain unclassified and retained. This panel is independent of the client platform filter.">
    <div className="admin-stats-grid">
      <Stat title="Completed reports" value={count(ledger.summary.completed)} note="Saved user report records" />
      <Stat title="Failed reports" value={count(ledger.summary.failed)} note="Saved failed report records" />
      <Stat title="Confirmed credit scans" value={count(data.scanLedger.summary.completed)} note="Customer reservations, including free credits; known internal and sandbox checks excluded" />
      <Stat title="Client completions" value={count(data.summary.evaluations)} note="Observed events for the selected platform" />
    </div>
    <AnalyticsChart rows={ledger.daily} metrics={[{key:'completed',label:'Completed reports',color:colors.blue},{key:'failed',label:'Failed reports',color:colors.orange}]} days={days} title="Stored user reports" />
    <DataDetails><Table rows={ledger.daily} columns={['day','completed','failed']} /></DataDetails>
  </Panel>
}
function Acquisition({ data, days }: { data: AnalyticsDashboard; days: number }) {
  return <>
    <DailyChart data={data} days={days} title="Acquisition activity" metrics={acquisitionMetrics} />
    <div className="admin-section-grid"><Funnel title="Homepage → App Store click" rows={data.web} /><Panel title="Leading sources" description="Devices observed by source; redirects are not downloads." note="One source per observed device: creator link, first UTM source, then earliest recorded external referrer. Login, checkout, and Mogging referrals are excluded. Direct / unattributed means no reliable source was recorded; milestone counts are not conversion rates."><Bars rows={data.acquisition.slice(0, 8).map(row => ({ label: `${row.source}${row.campaign !== '—' ? ` · ${row.campaign}` : ''}`, value: Number(row.actors), detail: `${count(row.first_opens)} first opens · ${count(row.purchase_actors)} purchasing devices` }))} /></Panel></div>
    <Panel title="Website audiences" description="Creator activity is separate from public website traffic. Browsers can visit more than one surface."><Table rows={data.webAudience ?? []} columns={['surface','browsers','pageviews']} /></Panel>
    <Notice>App Store redirects are not attributed installs. Mobile first opens only identify acquisition when the app supplies attribution; direct / unattributed is missing evidence, not proof of organic acquisition.</Notice>
    <Panel title="Homepage A/B tests" description="Compare the old and new homepage and inspect historical experiments."><Link href="/admin/analytics/experiments" className="text-sm font-medium text-[#00A8EF]">View all A/B tests →</Link></Panel>
    <div className="admin-section-grid"><Panel title="Homepage section reach" description="Unique visitors who saw at least 25% of each section."><Table rows={data.landingSections ?? []} columns={['section','visitors']} /></Panel><Panel title="Homepage CTA placements" description="Unique clickers by destination and button location." note="A visitor can click multiple placements; these rows must not be added together."><Table rows={data.landingPlacements ?? []} columns={['placement','destination','visitors']} /></Panel></div>
    <Panel title="Homepage sources" description="Sources for exposed homepage visitors." note="Source is a creator link or first UTM source, then the first recorded external referrer, otherwise direct / unattributed. Paid checkouts are confirmed by the Stripe webhook."><Table rows={data.landingSources ?? []} columns={['source','visitors','store_clicks','web_starts','paid_checkouts']} /></Panel>
    <EventReport data={data} section="Acquisition" />
    <Panel title="Source detail" description="Compare each observed source and campaign."><Table rows={data.acquisition} columns={['source','campaign','actors','first_opens','store_redirects','purchase_actors']} /><p className="mt-5 text-sm text-[#73777d]">For verified creator credit, open <Link href="/admin/attribution" className="text-[#008ac5] underline underline-offset-4">creator attribution</Link>.</p></Panel>
  </>
}
function Onboarding({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const screens: MetricRow[] = onboardingScreenRows(data.onboardingScreens ?? []).map(row => ({ ...row,
    status: Number(row.viewed) > 0 ? 'Observed' : 'Awaiting data',
    continuation: percent(Number(row.continued), Number(row.viewed)), drop_off: percent(Number(row.dropped), Number(row.mature)),
  }))
  return <>
    <DailyChart data={data} days={days} title="Onboarding activity" metrics={[{key:'onboarding_starts',label:'Started',color:colors.ink},{key:'onboarding_completions',label:'Completed',color:colors.green},{key:'paywall_views',label:'Paywall views',color:colors.blue}]}/>
    <div className="admin-section-grid"><Funnel title="Onboarding → first value" rows={data.onboarding}/><Panel title="Screen reach" description="All tracked screens, in their app order." note="Observed first views and continuation per flow, not one joined cohort. Optional screens have their own audiences; their counts can differ from neighboring steps. Recent views can still continue. Empty screens remain visible as awaiting data."><ComparisonBars series={[{label:'Viewed',color:colors.blue},{label:'Continued',color:colors.green}]} rows={screens.map(row=>({label:String(row.screen),values:[Number(row.viewed),Number(row.continued)],detail:Number(row.viewed)>0?`${row.continuation} continued`:'Awaiting data'}))}/></Panel></div>
    <Panel title="Onboarding screens" description="Compatible onboarding screen cohorts · tracking revisions 3 and 4." note="Optional screens only count users who actually see them. Awaiting data means no screen views have been recorded for the selected period and platform. Conversion and drop-off rates remain blank until their denominators are available."><DataDetails><Table rows={screens} columns={['screen','status','viewed','continued','continuation','drop_off']} /><Table rows={screens} columns={['screen','pending','mature','dropped','median_ms','back_actions']} /></DataDetails></Panel>
    <div><Panel title="Where users leave" description="Drop-off among screen views at least seven days old." note="Counts a device's first screen view per flow. Continued means reaching a later screen or completing an evaluation within seven days. Optional skips do not create false drop-off. Recent views are pending. Uses compatible tracking revisions 3 and 4; older or unversioned flows remain visible in event totals and coverage below."><Bars maximum={100} format={value => `${value.toFixed(1)}%`} rows={screens.filter(row => Number(row.mature) > 0).map(row => ({ label: String(row.screen), value: Number(row.dropped) / Number(row.mature) * 100, detail: `${count(row.dropped)} of ${count(row.mature)} mature views · ${count(row.pending)} pending` }))} /></Panel></div>
    <EventReport data={data} section="Onboarding" />
    <Panel title="Onboarding revision coverage" description="Every recorded revision stays visible." note="Revisions 3 and 4 share screen ordering. Earlier and unversioned events count toward event totals, but cannot be safely combined with the current per-screen cohorts."><Table rows={data.onboardingRevisions} columns={['revision','views','devices','coverage']} /></Panel>
    <Panel title="Friction signals" description="Permission refusals, cancelled purchases, and safe error codes." note="Signals do not prove an error caused drop-off. No questionnaire answers, photos, or scan scores are recorded."><Table rows={data.onboardingFriction ?? []} columns={['screen','event','reason','affected_devices','events']} /></Panel>
    <Panel title="Step activity & screen exposure" description="Additional context from recorded screen events." note="Step activity is unique devices per milestone, not sequential completion. Foreground exposure is recorded on exits, not active attention; app termination may omit exits. Durations are capped at 30 minutes."><DataDetails><Table rows={data.steps} columns={['step','viewed','completed','skipped','back_actions']} /><Table rows={data.screens} columns={['screen','exits','median_ms','p90_ms']} /></DataDetails></Panel>
  </>
}
function StripeReportingHealth() {
  const health = useSWR<Health>('/api/admin/analytics-health', apiGet, { dedupingInterval: 60_000, shouldRetryOnError: false })
  const data = health.data
  return <Panel title="Stripe reporting health" description="Verified purchases are recorded once across checkout return, webhooks and recovery." note="Recovery checks the previous seven days every five minutes. Technical failures appear in Backend reliability; payment failure reasons appear in the billing context below.">
    {health.error ? <Notice>Stripe reporting health could not load.</Notice> : !data ? <p className="admin-empty">Checking Stripe reporting…</p> : <>
      {data.unrecorded_stripe_purchases > 0 ? <Notice>{count(data.unrecorded_stripe_purchases)} paid Stripe purchases are missing from the billing ledger. Revenue is incomplete until recovery succeeds.</Notice> : null}
      {data.stripe_reconciliation?.webhook_ready === false ? <Notice>Stripe webhook configuration needs attention. Scheduled recovery is checking for missed events.</Notice> : null}
      <Table rows={[
        { metric: 'Paid purchases missing from ledger', value: data.unrecorded_stripe_purchases },
        { metric: 'Last stored Stripe event', value: data.last_stripe_receipt },
        { metric: 'Last recovery check', value: data.stripe_reconciliation?.checked_at ?? 'Awaiting first check' },
        { metric: 'Webhook configuration', value: data.stripe_reconciliation ? data.stripe_reconciliation.webhook_ready === null ? 'Unable to check' : data.stripe_reconciliation.webhook_ready ? 'Ready' : 'Needs attention' : 'Not yet checked' },
      ]} columns={['metric','value']} />
    </>}
  </Panel>
}
function MetricGrowth({ current, previous, unknown = false, comparison, detail, zeroLabel = 'New', reverseColors = false }: {
  current: number; previous: number; unknown?: boolean; comparison: string; detail: string; zeroLabel?: string; reverseColors?: boolean
}) {
  const change = current - previous
  const Icon = unknown || change === 0 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight
  const growth = unknown ? 'Unavailable' : previous === 0
    ? current === 0 ? '0%' : current > 0 ? zeroLabel : 'Net decrease'
    : `${change > 0 ? '+' : ''}${new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(change / Math.abs(previous) * 100)}%`
  const improves = reverseColors ? change < 0 : change > 0
  return <p className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs leading-5" title={detail}>
    <span className={`inline-flex items-center gap-0.5 font-medium ${unknown || change === 0 ? 'text-[#73777d]' : improves ? 'text-emerald-600' : 'text-rose-600'}`}><Icon className="size-3.5" aria-hidden="true" />{growth}</span>
    <span className="text-[#858a91]">{comparison}</span>
  </p>
}
const revenueActivityMetrics = [
  { key: 'new_subscriptions', title: 'New subscriptions', note: 'First recorded paid subscriptions', comparison: 'last 24h vs previous 24h' },
  { key: 'scans_bought', title: 'New scans bought', note: 'One-off scan credits · packs count as 3', comparison: 'last 24h vs previous 24h' },
  { key: 'active_subscriptions', title: 'Active subscriptions', note: 'Current unexpired subscription access', comparison: 'vs 24h ago' },
  { key: 'canceled_subscriptions', title: 'Canceled / discontinued', note: 'Current cancellation intent or ended access', comparison: 'vs 24h ago' },
]

function Revenue({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const currency = data.revenue.some(row => row.currency === selectedCurrency) ? selectedCurrency : String(data.revenue[0]?.currency || '')
  const total = data.revenue.find(row => row.currency === currency)
  const rows = (data.revenueDaily ?? []).filter(row => row.currency === currency)
  return <>
    <section aria-label="Total earned" className="mb-8">
      <h2 className="text-sm font-medium">Total earned · all time</h2>
      <p className="mt-1 text-xs leading-5 text-[#858a91]">Verified net revenue · all platforms · before fees and taxes · currencies stay separate</p>
      {data.revenueTotals?.length ? <div className="admin-stats-grid mt-5">
        {data.revenueTotals.map(row => <div key={String(row.currency)} className="admin-metric">
          <p className="text-xs text-[#73777d]">{String(row.currency)}</p>
          <p className="mt-3 text-[32px] font-medium tabular-nums tracking-[-0.045em] text-[#181a1d]">{money(row.net, String(row.currency))}</p>
          <MetricGrowth current={Number(row.last_24h)} previous={Number(row.previous_24h)} unknown={Number(row.recent_missing_amount_events) > 0 || row.net == null}
            comparison="last 24h vs previous 24h" zeroLabel="New revenue"
            detail={`Last 24h: ${money(row.last_24h, String(row.currency))}; preceding 24h: ${money(row.previous_24h, String(row.currency))}`} />
          {Number(row.missing_amount_events) > 0 ? <p className="mt-1 text-xs text-[#858a91]">{count(row.missing_amount_events)} unknown amounts excluded</p> : null}
        </div>)}
      </div> : <Notice>No verified earnings recorded yet.</Notice>}
    </section>
    <section aria-label="Subscriptions and scan purchases" className="mb-8">
      <div className="admin-stats-grid">
        {revenueActivityMetrics.map(metric => {
          const row = data.revenueActivity?.find(row => row.metric === metric.key)
          const unconfirmed = Number(row?.unknown_status ?? 0)
          return <div key={metric.key} className="admin-metric">
            <p className="text-xs text-[#73777d]">{metric.title}</p>
            <p className="mt-3 text-[32px] font-medium tabular-nums tracking-[-0.045em] text-[#181a1d]">{row ? count(row.total) : '—'}{unconfirmed ? <span className="ml-1.5 text-xs tracking-normal text-[#858a91]">confirmed</span> : null}</p>
            {row ? <MetricGrowth current={Number(row.last_24h)} previous={Number(row.previous_24h)} unknown={unconfirmed > 0 || Number(row.previous_unknown_status) > 0} comparison={metric.comparison}
              detail={`${metric.comparison === 'vs 24h ago' ? 'Now / 24h ago' : 'Last 24h / preceding 24h'}: ${count(row.last_24h)} / ${count(row.previous_24h)}`} reverseColors={metric.key === 'canceled_subscriptions'} /> : null}
            <p className="mt-2 text-xs leading-5 text-[#858a91]">{row && ['new_subscriptions','scans_bought'].includes(metric.key) ? `${count(row.last_24h)} in last 24h · ` : ''}{metric.note}{unconfirmed ? ` · ${count(unconfirmed)} status unconfirmed` : ''}</p>
          </div>
        })}
      </div>
      <p className="mt-3 text-xs leading-5 text-[#858a91]">All time · production billing only. Renewals do not count as new subscriptions. Canceled subscriptions can remain active until paid access expires. Status without a recorded expiry stays unconfirmed.</p>
    </section>
    {total ? <>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Revenue in {currency}</h2><AnalyticsSelect label="Currency" value={currency} onChange={setSelectedCurrency} options={data.revenue.map(row=>({value:String(row.currency),label:String(row.currency)}))} /></div>
      <div className="admin-stats-grid"><Stat title="Known gross" value={money(total.gross, currency)} note="Recorded positive amounts" /><Stat title="Recorded refunds" value={money(total.refunds, currency)} note="Recorded negative amounts" /><Stat title="Known net" value={money(total.net, currency)} note="Before provider fees and taxes" /><Stat title="Unknown amounts" value={count(total.missing_amount_events)} note="Excluded from monetary totals" /></div>
      <Panel title="Revenue over time" description={`${days === 1 ? "Hourly" : "Daily"} recorded amounts · ${currency}`} note="Provider-confirmed events, deduplicated by the billing ledger. Net is gross minus recorded refunds, before fees and taxes; it is not profit or MRR. Buckets without ledger events are omitted. Buckets with only unknown amounts are excluded from the chart."><AnalyticsChart key={currency} title="Revenue over time" rows={rows} metrics={revenueMetrics} days={days} currency={currency} /><DataDetails><Table rows={rows} columns={['day','gross','refunds','net','missing_amount_events']} /></DataDetails></Panel>
    </> : <Notice>No verified billing events in this window.</Notice>}
    <StripeReportingHealth />
    <Panel title="Revenue by currency" description="Amounts are never combined across currencies."><Table rows={data.revenue.map(row => ({ ...row, gross: money(row.gross, String(row.currency)), refunds: money(row.refunds, String(row.currency)), net: money(row.net, String(row.currency)) }))} columns={['currency','gross','refunds','net','missing_amount_events']} /></Panel>
    <Panel title="Revenue by provider & product" description="Currency-separated ledger amounts and account-linking coverage." note="Counts are observed ledger events and distinct subscriptions, not current active subscriber balances. Missing amounts remain unknown; fees and taxes are not deducted."><Table rows={(data.billingProducts ?? []).map(row => ({...row, gross:money(row.gross,String(row.currency)),refunds:money(row.refunds,String(row.currency)),net:money(row.net,String(row.currency))}))} columns={['provider','product','currency','events','customers','subscriptions','unlinked_events','gross','refunds','net','missing_amount_events']} /></Panel>
    <DimensionReport title="Billing context & reasons" rows={data.billingDimensions ?? []} />
    <Panel title="Subscription lifecycle" description="Provider-confirmed events, grouped by customer." note="Cancellation scheduled is intent; expiry is loss of access. These are events observed in the selected window, not current subscriber balances."><Bars rows={data.billing.map(row => ({ label: `${label(String(row.event))} · ${row.provider}`, value: Number(row.events), detail: `${count(row.customers)} customers` }))} /><DataDetails><Table rows={data.billing} columns={['provider','provider_type','event','events','customers']} /></DataDetails></Panel>
  </>
}
function PaidDelivery({ data }: { data: AnalyticsDashboard }) {
  const rows = data.paidDelivery ?? []
  const day = rows.find(row => Number(row.window_days) === 1)
  return <Panel title="Paid customers receiving their report" description="Verified payment → activation observed → report generated → received → viewed."
    note="All platforms. Linked accounts enter on their earliest recorded positive production payment in the selected period, including one-time purchases. Earlier payment history is checked; renewals do not create another customer. Each row uses only accounts with a full 1- or 7-day follow-up; pending accounts are not failures. Server reservations establish generation; receipt, viewing and activation require client observations and can be missing on older builds. Received and viewed report IDs must match a completed post-payment reservation, including successful retries. Time is from payment to the first matching report view. Known internal and sandbox activity is excluded; unlinked billing cannot be assigned a delivery outcome.">
    <div className="admin-stats-grid"><Stat title="Observed view within 24h" value={day ? percent(Number(day.report_viewed), Number(day.eligible)) : '—'} note="Verified payers with complete follow-up" /><Stat title="Awaiting full 24h" value={day ? count(day.pending) : '—'} note="Immature cohort, not lost customers" /></div>
    <Table rows={rows.map(row => ({ ...row, window: `${row.window_days} days`, delivery_rate: percent(Number(row.report_viewed), Number(row.eligible)), view_unobserved: Number(row.eligible) - Number(row.report_viewed) }))} columns={['window','payers','eligible','pending','activation_observed','report_generated','report_received','report_viewed','view_unobserved','delivery_rate','median_ms']} />
  </Panel>
}
function FeatureUsage({ data }: { data: AnalyticsDashboard }) {
  const rows = data.featureUsage ?? []
  return <>
    <Panel title="Course usage" description="Which courses people open, work through, and finish." note="Unique devices in the selected window. Active days are device-days in UTC. Lessons opened/completed are distinct device–lesson pairs; these totals are not a sequential conversion rate. Median reading time counts finished foreground visits only, including interrupted visits; background time is excluded. Older app versions do not emit these events.">
      <Table rows={rows.filter(row => row.feature === 'courses')} columns={['course_id','users','active_days','lessons_opened','lessons_completed','courses_completed','median_ms']} />
    </Panel>
    <Panel title="Progress usage" description="Do people return to inspect progress and act on it?" note="Unique devices; area views are deliberate opens, not chart scrubs. Protocol/evaluation opens count devices choosing that destination, not completed tasks or scans. Median foreground visit time excludes time outside the app.">
      <Table rows={rows.filter(row => row.feature === 'progress')} columns={['users','active_days','area_views','protocol_opens','evaluation_opens','median_ms']} />
    </Panel>
  </>
}
function Retention({ data, days }: { data: AnalyticsDashboard; days: number }) {
  return <>
    <Panel title="Do people come back to courses and progress?" description="Same-feature return on day 1, day 7 and day 30 after first meaningful use." note="Account cohorts begin at the earliest observed lesson completion, area-history open, or foreground feature visit lasting at least 10 seconds. Earlier history is checked. Return must meet the same meaningful-use rule in the exact 24-hour D1/D7/D30 window, on that same feature. Only accounts with a full follow-up window are eligible. Internal/sandbox traffic and anonymous-only activity are excluded; this measures observed use, not whether the feature caused retention. New instrumentation needs time to mature.">
      <Table rows={(data.featureRetention ?? []).map(row => ({ ...row, rate: percent(Number(row.retained), Number(row.eligible)) }))} columns={['feature','day','cohort_accounts','eligible','retained','rate']} />
    </Panel>
    <Panel title="Do subscribers use the membership?" description="First protocol action and return for a second completed scan."
      note="All platforms. Linked subscribers enter on their earliest recorded positive subscription payment in the selected period; earlier history is checked. Counts and rates use only subscribers with a complete 7- or 14-day follow-up from payment. Protocol use requires a completed task after subscribing. Return requires a different completed report ID at least 24 hours after the first successful post-payment scan started. Retries, reused report IDs and reopening a report do not count as another scan. Internal and sandbox activity is excluded. Missing client task observations do not prove a subscriber did nothing.">
      <Table rows={(data.membershipActivation ?? []).map(row => ({ ...row, window: `${row.window_days} days`, protocol_rate: percent(Number(row.first_protocol_action), Number(row.eligible)), second_scan_rate: percent(Number(row.returned_for_second_scan), Number(row.eligible)) }))} columns={['window','subscribers','eligible','pending','first_protocol_action','protocol_rate','returned_for_second_scan','second_scan_rate']} />
    </Panel>
    <Panel title="Return after the first observed scan" description="Meaningful return on day 1, day 7, and day 30." note="Account cohorts enter this period only when their earliest recorded production scan completion falls within it. Earlier history is searched before assigning a cohort. Exact D1/D7/D30 windows count report views, completed protocol tasks, scans, lesson completions, progress-area opens, or at least 10 seconds of foreground learning/progress use. Only fully observed accounts are eligible; an immature cohort has no rate."><Bars maximum={100} rows={retentionRates(data.retention)} format={value => `${value.toFixed(1)}%`} /><DataDetails><Table rows={data.retention.map(row => ({ ...row, rate: percent(Number(row.retained), Number(row.eligible)) }))} columns={['day','eligible','retained','rate']} /></DataDetails></Panel>
    <DailyChart data={data} days={days} title="Value-building activity" metrics={valueMetrics} />
    <div className="admin-section-grid"><Panel title="Cancellation timing" description="When cancellation intent is first observed." note="Relative to the earliest recorded production scan completion, including history before the selected period. Billing includes every platform, while evaluation history follows the platform filter. This is not a churn rate."><DistributionChart rows={data.cancellations.map(row => ({ label: String(row.timing), value: Number(row.accounts) }))} /></Panel><Panel title="Value signals" description="Activity totals across all users." note="Includes people who are not currently paying. Share intent is not proof of a completed social post."><Bars rows={data.actions.filter(row => !String(row.event).endsWith('_failed')).map(row => ({ label: label(String(row.event)), value: Number(row.actors), detail: `${count(row.events)} events` }))} /></Panel></div>
  </>
}
function Quality({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const health = useSWR<Health>('/api/admin/analytics-health', apiGet, { dedupingInterval: 60_000, shouldRetryOnError: false })
  return <>
    <DailyChart data={data} days={days} title="Scan failures" metrics={qualityMetrics} />
    <Panel title="Delivery & provider health" description="Check export backlogs and the latest stored billing events." note="PostHog export is optional; a backlog is expected when export is disabled. Billing event timestamps and webhook backlogs include both production and sandbox. Stored billing events can include recovered history. Requests rejected before webhook validation do not enter the receipt backlog; inspect Backend reliability for those failures. Configuration flags and webhook counts do not prove end-to-end delivery.">
      {health.error ? <Notice>Health checks could not load. <button className="underline" onClick={() => void health.mutate()}>Try again</button></Notice> : !health.data ? <p className="admin-empty">Loading health checks…</p> : <>
        <div className="admin-stats-grid"><Stat title="Behavior & identity backlog" value={count(health.data.pending_events)} note="Events awaiting export" /><Stat title="Billing export backlog" value={count(health.data.pending_billing_events)} note="Billing events awaiting export" /><Stat title="Unfinished webhooks" value={count(health.data.unfinished_webhooks)} note="Older than ten minutes" /></div>
        <Table rows={[{ metric: 'Oldest behavior backlog', value: health.data.oldest_pending_event }, { metric: 'Last stored RevenueCat event', value: health.data.last_revenuecat_receipt }, { metric: 'Last stored Stripe event', value: health.data.last_stripe_receipt }]} columns={['metric','value']} />
        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#73777d]">{Object.entries(health.data.configured).map(([key, value]) => <li key={key}><span className={`mr-2 inline-block size-1.5 rounded-full ${value ? 'bg-[#40a88a]' : 'bg-[#db9474]'}`} />{label(key)}: {value ? 'Configured' : 'Not configured'}</li>)}</ul>
      </>}
    </Panel>
    <Panel title="Release comparison" description="Observed scan failures and latency by app release." note="Scan latency includes backend and network work. Compare similar audiences and devices; these are not startup, frame-time, or tracking-overhead measurements."><Table rows={data.releases} columns={['release','platform','actors','evaluations_started','evaluation_failures','median_evaluation_ms']} /></Panel>
    <Panel title="Event delivery by release" description="Time from the client event timestamp to server receipt, plus clock skew." note="Batching, offline queues, network transit, and client clock differences affect these values. Negative delays are counted as clock skew and excluded from duration percentiles. This is not API request latency."><Table rows={data.eventDelivery ?? []} columns={['platform','release','schema_version','events','clock_skew_events','median_ms','p90_ms']} /></Panel>
    <TrackingCoverage data={data} />
    <Panel title="Identifier coverage" description="Presence and uniqueness of stored attribution and flow context; raw IDs stay private."><Table rows={data.contextCoverage ?? []} columns={['field','events','actors','unique_ids']} /></Panel>
    <Panel title="Snapshot diagnostics"><dl className="flex flex-wrap gap-x-12 gap-y-5 text-sm">{[['Query time', `${count(data.queryMs)} ms`], ['Events scanned', count(data.summary.events)], ['Newest event', data.summary.latest_event ? `${data.summary.latest_event} UTC` : 'No events']].map(([title, value]) => <div key={title}><dt className="text-[#858a91]">{title}</dt><dd className="mt-2 font-medium">{value}</dd></div>)}</dl></Panel>
  </>
}
function Funnel({ title, rows }: { title: string; rows: AnalyticsDashboard['onboarding'] }) {
  const total = rows[0]?.actors ?? 0
  return <Panel title={title} description="Ordered milestones per device · seven-day completion window" note="Each milestone follows the previous one within seven days of entry. All observations must be in the selected period. Recent entrants may still complete. A client purchase completion is not verified revenue.">
    <Bars rows={rows.map((row, index) => ({label: `${index + 1}. ${label(row.name)}`, value: row.actors, detail: `${percent(row.actors, total)} of entrants${index > 0 ? ` · ${percent(rows[index - 1].actors - row.actors, rows[index - 1].actors)} drop from previous step` : ''}`}))} />
  </Panel>
}
