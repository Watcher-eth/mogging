import { ExperimentsReport } from './experiments-report'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { RefreshCw } from 'lucide-react'
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
]
const revenueMetrics: ChartMetric[] = [
  { key: 'gross', label: 'Gross', color: colors.blue },
  { key: 'refunds', label: 'Refunds', color: colors.orange },
  { key: 'net', label: 'Net', color: colors.green },
]
const qualityMetrics: ChartMetric[] = [{ key: 'failures', label: 'Scan failures', color: colors.orange }]
const observationNote = 'Counts are observed events per UTC bucket, except active devices and first app opens which are distinct devices. Buckets with no recorded events are omitted; a gap does not establish zero users or an outage. Boundary buckets are partial. Purchase completion is a client signal, not verified billing.'
type Health = { pending_events: number; pending_billing_events: number; unfinished_webhooks: number;
  oldest_pending_event: string | null; last_revenuecat_receipt: string | null; last_stripe_receipt: string | null;
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
  return <>
    <CreatorHeader eyebrow="Analytics" title={page?.title || 'Product overview'} description={page?.description || 'Understand daily activity and the path to value.'} />
    <div className="admin-report-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsSelect label="Period" value={days} onChange={value => filter('days', value)} options={[1,7,30,90].map(day => ({value:String(day),label:day === 1 ? "Last 24 hours" : `Last ${day} days`}))} />
        {!['Reliability','Experiments'].includes(tab)?<AnalyticsSelect label="Platform" value={platform} onChange={value => filter('platform', value)} options={['all','web','ios','android'].map(value => ({value,label:value === 'all' ? 'All platforms' : value === 'ios' ? 'iOS' : label(value)}))}/>:null}
        <Button variant="ghost" className="size-10 p-0 text-[#73777d]" aria-label="Refresh analytics" disabled={report.isValidating} onClick={() => void (tab === 'Reliability'?mutate(`/api/admin/reliability?days=${days}`):report.mutate())}><RefreshCw className={`size-4 ${report.isValidating ? 'animate-spin' : ''}`} /></Button>
      </div>
      <p className="text-xs text-[#858a91]" aria-live="polite">{data ? `Updated ${new Date(data.generatedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' })} UTC` : 'UTC reporting'} · Production</p>
    </div>
    {report.error ? <Notice>Analytics could not load. <button className="underline" onClick={() => void report.mutate()}>Try again</button>. Missing data is never shown as zero.</Notice> : null}
    {tab === 'Reliability'?<ReliabilityReport days={Number(days)}/>:!data ? !report.error ? <Notice>Loading reporting snapshot…</Notice> : null : <>
      {!data.summary.events ? <Notice>No production behavior events in this window. Check ingestion and the released app version; billing may still be available.</Notice> : null}
      {tab === 'Overview' ? <Overview data={data} days={Number(days)} /> : null}
      {tab === 'Experiments' ? <ExperimentsReport data={data} /> : null}
      {tab === 'Acquisition' ? <Acquisition data={data} days={Number(days)} /> : null}
      {tab === 'Onboarding' ? <Onboarding data={data} days={Number(days)} /> : null}
      {tab === 'Revenue' ? <Revenue data={data} days={Number(days)} /> : null}
      {tab === 'Retention' ? <Retention data={data} days={Number(days)} /> : null}
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
    {section === 'Authentication' ? <p className="mb-5 text-sm text-[#73777d]">Older app releases combine cancellations and setup errors with auth failures. Updated releases report these outcomes separately; historical events retain their original classification.</p> : null}
    {daily ? <DailyChart data={data} days={days} title={section === 'Scans' ? 'Scan outcomes' : section === 'Purchases' ? 'Paywall activity' : section === 'Authentication' ? 'Authentication outcomes' : section === 'Referrals' ? 'Referral activity' : section === 'Notifications' ? 'Notification engagement' : 'Value-building activity'} metrics={daily} /> : null}
    {section === 'Purchases' ? <Funnel title="Paywall conversion" rows={data.paywall} /> : null}
    {section !== 'AttributionLedger' ? <EventReport data={data} section={section as 'Authentication' | 'Purchases' | 'Scans' | 'Engagement' | 'Referrals' | 'Notifications'} /> : null}
    {['Authentication','Purchases','Referrals','Notifications','AttributionLedger'].includes(section) ? <OperationalReport days={days} section={section} /> : null}
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
      <Stat title="Active devices" value={count(data.summary.actors)} note="Devices / browsers, across the period" />
      <Stat title="First app opens" value={count(data.summary.first_opens)} note="Observed new installations" />
      <Stat title="Completed scans" value={count(data.summary.evaluations)} note="Client-observed completions" />
      <Stat title="Scan failures" value={count(data.summary.failures)} note="Events, not a cohort failure rate" />
    </div>
    <DailyChart data={data} days={days} title="Product activity" metrics={activityMetrics} />
    <div className="admin-section-grid"><Funnel title="Mobile activation" rows={data.onboarding} /><Funnel title="Paywall conversion" rows={data.paywall} /></div>
  </>
}
function Acquisition({ data, days }: { data: AnalyticsDashboard; days: number }) {
  return <>
    <DailyChart data={data} days={days} title="Acquisition activity" metrics={acquisitionMetrics} />
    <div className="admin-section-grid"><Funnel title="Homepage → App Store click" rows={data.web} /><Panel title="Leading sources" description="Devices observed by source; redirects are not downloads." note="Top first-touch creator link IDs or UTM sources and campaigns. A device can appear in multiple rows; these are milestone counts, not joined attribution conversion rates."><Bars rows={data.acquisition.slice(0, 8).map(row => ({ label: `${row.source}${row.campaign !== '—' ? ` · ${row.campaign}` : ''}`, value: Number(row.actors), detail: `${count(row.first_opens)} first opens · ${count(row.purchase_actors)} purchasing devices` }))} /></Panel></div>
    <Panel title="Homepage A/B tests" description="Compare the old and new homepage and inspect historical experiments."><Link href="/admin/analytics/experiments" className="text-sm font-medium text-[#00A8EF]">View all A/B tests →</Link></Panel>
    <div className="admin-section-grid"><Panel title="Homepage section reach" description="Unique visitors who saw at least 25% of each section."><Table rows={data.landingSections ?? []} columns={['section','visitors']} /></Panel><Panel title="Homepage CTA placements" description="Unique clickers by destination and button location." note="A visitor can click multiple placements; these rows must not be added together."><Table rows={data.landingPlacements ?? []} columns={['placement','destination','visitors']} /></Panel></div>
    <Panel title="Homepage sources" description="Sources for exposed homepage visitors." note="Source is first UTM source, otherwise the recorded referrer, otherwise direct / unknown. Paid checkouts are confirmed by the Stripe webhook."><Table rows={data.landingSources ?? []} columns={['source','visitors','store_clicks','web_starts','paid_checkouts']} /></Panel>
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
    <Panel title="Onboarding screens" description="Current onboarding · tracking revision 3 · app 0.1.63 onward." note="Optional screens only count users who actually see them. Awaiting data means no screen views have been recorded for the selected period and platform. Conversion and drop-off rates remain blank until their denominators are available."><DataDetails><Table rows={screens} columns={['screen','status','viewed','continued','continuation','drop_off']} /><Table rows={screens} columns={['screen','pending','mature','dropped','median_ms','back_actions']} /></DataDetails></Panel>
    <div><Panel title="Where users leave" description="Drop-off among screen views at least seven days old." note="Counts a device's first screen view per flow. Continued means reaching a later screen or completing an evaluation within seven days. Optional skips do not create false drop-off. Recent views are pending. Uses tracking revision 3 from app 0.1.63 onward; older flows are excluded."><Bars maximum={100} format={value => `${value.toFixed(1)}%`} rows={screens.filter(row => Number(row.mature) > 0).map(row => ({ label: String(row.screen), value: Number(row.dropped) / Number(row.mature) * 100, detail: `${count(row.dropped)} of ${count(row.mature)} mature views · ${count(row.pending)} pending` }))} /></Panel></div>
    <EventReport data={data} section="Onboarding" />
    <Panel title="Friction signals" description="Permission refusals, cancelled purchases, and safe error codes." note="Signals do not prove an error caused drop-off. No questionnaire answers, photos, or scan scores are recorded."><Table rows={data.onboardingFriction ?? []} columns={['screen','event','reason','affected_devices','events']} /></Panel>
    <Panel title="Step activity & screen exposure" description="Additional context from recorded screen events." note="Step activity is unique devices per milestone, not sequential completion. Foreground exposure is recorded on exits, not active attention; app termination may omit exits. Durations are capped at 30 minutes."><DataDetails><Table rows={data.steps} columns={['step','viewed','completed','skipped','back_actions']} /><Table rows={data.screens} columns={['screen','exits','median_ms','p90_ms']} /></DataDetails></Panel>
  </>
}
function Revenue({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const currency = data.revenue.some(row => row.currency === selectedCurrency) ? selectedCurrency : String(data.revenue[0]?.currency || '')
  const total = data.revenue.find(row => row.currency === currency)
  const rows = (data.revenueDaily ?? []).filter(row => row.currency === currency)
  return <>
    <p className="mb-6 text-xs leading-5 text-[#858a91]">Verified billing · all platforms · excludes sandbox · currencies stay separate</p>
    {total ? <>
      <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-sm font-medium">Revenue in {currency}</h2><AnalyticsSelect label="Currency" value={currency} onChange={setSelectedCurrency} options={data.revenue.map(row=>({value:String(row.currency),label:String(row.currency)}))} /></div>
      <div className="admin-stats-grid"><Stat title="Known gross" value={money(total.gross, currency)} note="Recorded positive amounts" /><Stat title="Recorded refunds" value={money(total.refunds, currency)} note="Recorded negative amounts" /><Stat title="Known net" value={money(total.net, currency)} note="Before provider fees and taxes" /><Stat title="Unknown amounts" value={count(total.missing_amount_events)} note="Excluded from monetary totals" /></div>
      <Panel title="Revenue over time" description={`${days === 1 ? "Hourly" : "Daily"} recorded amounts · ${currency}`} note="Provider-confirmed events, deduplicated by the billing ledger. Net is gross minus recorded refunds, before fees and taxes; it is not profit or MRR. Buckets without ledger events are omitted. Buckets with only unknown amounts are excluded from the chart."><AnalyticsChart key={currency} title="Revenue over time" rows={rows} metrics={revenueMetrics} days={days} currency={currency} /><DataDetails><Table rows={rows} columns={['day','gross','refunds','net','missing_amount_events']} /></DataDetails></Panel>
    </> : <Notice>No verified billing events in this window.</Notice>}
    <Panel title="Revenue by currency" description="Amounts are never combined across currencies."><Table rows={data.revenue.map(row => ({ ...row, gross: money(row.gross, String(row.currency)), refunds: money(row.refunds, String(row.currency)), net: money(row.net, String(row.currency)) }))} columns={['currency','gross','refunds','net','missing_amount_events']} /></Panel>
    <Panel title="Revenue by provider & product" description="Currency-separated ledger amounts and account-linking coverage." note="Counts are observed ledger events and distinct subscriptions, not current active subscriber balances. Missing amounts remain unknown; fees and taxes are not deducted."><Table rows={(data.billingProducts ?? []).map(row => ({...row, gross:money(row.gross,String(row.currency)),refunds:money(row.refunds,String(row.currency)),net:money(row.net,String(row.currency))}))} columns={['provider','product','currency','events','customers','subscriptions','unlinked_events','gross','refunds','net','missing_amount_events']} /></Panel>
    <DimensionReport title="Billing context & reasons" rows={data.billingDimensions ?? []} />
    <Panel title="Subscription lifecycle" description="Provider-confirmed events, grouped by customer." note="Cancellation scheduled is intent; expiry is loss of access. These are events observed in the selected window, not current subscriber balances."><Bars rows={data.billing.map(row => ({ label: `${label(String(row.event))} · ${row.provider}`, value: Number(row.events), detail: `${count(row.customers)} customers` }))} /><DataDetails><Table rows={data.billing} columns={['provider','provider_type','event','events','customers']} /></DataDetails></Panel>
  </>
}
function Retention({ data, days }: { data: AnalyticsDashboard; days: number }) {
  return <>
    <Panel title="Return after the first observed scan" description="Meaningful return on day 1, day 7, and day 30." note="Account cohorts begin at their first evaluation observed in this window, not necessarily their first ever. Exact D1/D7/D30 windows count report views, completed protocol tasks, or scans. Only fully observed accounts are eligible; an immature cohort has no rate."><Bars maximum={100} rows={retentionRates(data.retention)} format={value => `${value.toFixed(1)}%`} /><DataDetails><Table rows={data.retention.map(row => ({ ...row, rate: percent(Number(row.retained), Number(row.eligible)) }))} columns={['day','eligible','retained','rate']} /></DataDetails></Panel>
    <DailyChart data={data} days={days} title="Value-building activity" metrics={valueMetrics} />
    <div className="admin-section-grid"><Panel title="Cancellation timing" description="When cancellation intent is first observed." note="Relative to the first evaluation observed in the same window. Billing includes every platform, while evaluation history follows the platform filter. This is not a churn rate."><DistributionChart rows={data.cancellations.map(row => ({ label: String(row.timing), value: Number(row.accounts) }))} /></Panel><Panel title="Value signals" description="Activity totals across all users." note="Includes people who are not currently paying. Share intent is not proof of a completed social post."><Bars rows={data.actions.filter(row => !String(row.event).endsWith('_failed')).map(row => ({ label: label(String(row.event)), value: Number(row.actors), detail: `${count(row.events)} events` }))} /></Panel></div>
  </>
}
function Quality({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const health = useSWR<Health>('/api/admin/analytics-health', apiGet, { dedupingInterval: 60_000, shouldRetryOnError: false })
  return <>
    <DailyChart data={data} days={days} title="Scan failures" metrics={qualityMetrics} />
    <Panel title="Delivery & provider health" description="Check event backlogs and the latest provider receipts." note="PostHog export is optional; a backlog is expected when export is disabled. Provider receipt timestamps and webhook backlogs include both production and sandbox. Configuration flags and webhook counts do not prove end-to-end delivery.">
      {health.error ? <Notice>Health checks could not load. <button className="underline" onClick={() => void health.mutate()}>Try again</button></Notice> : !health.data ? <p className="admin-empty">Loading health checks…</p> : <>
        <div className="admin-stats-grid"><Stat title="Behavior & identity backlog" value={count(health.data.pending_events)} note="Events awaiting export" /><Stat title="Billing export backlog" value={count(health.data.pending_billing_events)} note="Billing events awaiting export" /><Stat title="Unfinished webhooks" value={count(health.data.unfinished_webhooks)} note="Older than ten minutes" /></div>
        <Table rows={[{ metric: 'Oldest behavior backlog', value: health.data.oldest_pending_event }, { metric: 'Last RevenueCat receipt', value: health.data.last_revenuecat_receipt }, { metric: 'Last Stripe receipt', value: health.data.last_stripe_receipt }]} columns={['metric','value']} />
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
