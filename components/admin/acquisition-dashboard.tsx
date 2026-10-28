import { AnalyticsLink as Link } from './analytics-link'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, percent } from './analytics-ui'
import { EventReport } from './tracking-report'

const trafficMetrics: ChartMetric[] = [
  { key: 'website_visitors', label: 'Website visitors', color: chartColors.blue },
  { key: 'store_clickers', label: 'Store clickers', color: chartColors.violet },
  { key: 'first_opens', label: 'First app opens', color: chartColors.green },
]
const sourceName = (row: MetricRow) => {
  const source = String(row.source_label ?? row.source ?? 'Unknown source')
  return /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(source) ? 'Unresolved source ID' : source
}
const linkClass = 'text-sm font-medium text-[#008ac5] underline underline-offset-4'
const timestamp = (value: string) => formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

export function AcquisitionDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const summary = data.acquisitionSummary?.[0]
  const devices = Number(summary?.devices ?? 0)
  const sourced = Number(summary?.sourced_devices ?? 0)
  const homepage = data.landingSummary?.[0]
  const entries = Number(homepage?.entries ?? 0)
  const platform = data.filters.platform === 'all' ? 'All platforms' : data.filters.platform === 'ios' ? 'iOS' : data.filters.platform === 'web' ? 'Web' : 'Android'
  const mobileOnly = ['ios', 'android'].includes(data.filters.platform)
  const detailHref = (page: string) => ({ pathname: `/admin/analytics/${page}`, query: { days: String(days), platform: data.filters.platform } })
  const sources = data.acquisition ?? []
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · {platform} · Pacific time · Devices and browsers, not people</p>
    <div className="admin-stats-grid">
      <Stat title="Website visitors" value={mobileOnly ? '—' : count(summary?.website_visitors)} note={mobileOnly ? 'Choose Web or All platforms to see website traffic' : 'Distinct public-site browsers; creator, admin and sign-in pages excluded'} />
      <Stat title="Store clickers" value={count(summary?.store_clickers)} note="Distinct devices with a recorded store redirect; not downloads" />
      <Stat title="First app opens" value={count(summary?.first_opens)} note="Observed installations; not attributed to website clicks" />
      <Stat title="Source coverage" value={summary ? percent(sourced, devices) : '—'} note={summary ? `${count(sourced)} of ${count(devices)} observed devices have a recorded source` : 'Source totals are unavailable in this snapshot'} />
    </div>
    {!data.summary.events ? <Notice>No customer activity was observed in this period and platform. Missing observations do not establish zero traffic or healthy tracking.</Notice> : null}
    <Panel title="Acquisition over time" description={`${days === 1 ? 'Hourly' : 'Daily'} devices at each milestone · ${platform}`}
      note="Source: recorded customer activity in the selected period and platform. Each device counts once per milestone per bucket and once in the period total; do not add daily counts to recreate distinct period totals. Website browsers, store clickers and app installations are different populations, not a joined funnel. Store redirects include recorded handoffs and are not proof of installation. Creator/admin activity, known internal accounts and sandbox sessions are excluded; older unclassified runtime evidence remains included. Empty buckets are omitted and boundary buckets are partial.">
      <AnalyticsChart title="Acquisition over time" days={days} rows={data.daily} metrics={mobileOnly ? trafficMetrics.filter(metric => metric.key !== 'website_visitors') : trafficMetrics} />
      <DataDetails><Table rows={data.daily} columns={['day', 'website_visitors', 'store_clickers', 'first_opens']} /></DataDetails>
    </Panel>
    <Panel title="Sources & campaigns" description="Which recorded sources reach devices and bring app first opens?" action={<Link href="/admin/attribution" className={linkClass}>Creator attribution →</Link>}
      note="One source/campaign pair is assigned to each observed device using the existing precedence: creator link, first UTM source, then recorded external referrer. Assignment uses evidence inside the selected reporting window; it is not lifetime acquisition attribution. Login, checkout and Mogging referrers are excluded. Direct / unattributed means no reliable source was recorded, not proof of organic acquisition. Chart shows the top eight pairs; underlying data shows up to 50 pairs. Headline coverage uses an uncapped database aggregate. Client purchase observations are not verified billing, and these milestone counts are not sequential conversion rates.">
      <Bars rows={sources.slice(0, 8).map(row => ({ label: `${sourceName(row)}${row.campaign && row.campaign !== '—' ? ` · ${row.campaign}` : ''}`, value: Number(row.actors), detail: `${count(row.first_opens)} first opens · ${count(row.store_redirects)} store clickers` }))} />
      <p className="mt-4 text-sm leading-6 text-zinc-500">{summary ? `${count(devices - sourced)} observed devices have no reliable source. Attribution can be missing even when a campaign brought the customer.` : 'Source coverage is unavailable; source rows must not be used to infer a total.'}</p>
      <DataDetails><Table rows={sources.map(row => ({ ...row, source: sourceName(row), store_clickers: row.store_redirects, client_purchasing_devices: row.purchase_actors }))} columns={['source', 'campaign', 'actors', 'first_opens', 'store_clickers', 'client_purchasing_devices']} /></DataDetails>
    </Panel>
    {mobileOnly ? <Panel title="Homepage outcomes" description="Website behavior is outside the selected mobile platform."><p className="text-sm leading-6 text-zinc-500">Choose Web or All platforms to review homepage sources, destinations and placement performance.</p></Panel> : <>
      <Panel title="Homepage visitor outcomes" description={`${count(homepage?.entries)} tracked homepage entries · observed outcomes, not final conversion rates`} action={<Link href={detailHref('experiments')} className={linkClass}>A/B tests →</Link>}
        note="Source: versioned homepage landing entries with compatible experiment/variant evidence. Older page views without this context are excluded, so this cohort is narrower than all website visitors. Each entry counts once per outcome; a browser can create more than one entry and outcomes can overlap. Outcomes must follow entry, match its experiment/variant, occur within seven days and fall inside the selected period. Recent entries can still convert. Store clicks exclude automatic iPhone and handoff placements. Entries with payment require a positive, server-confirmed paid checkout; they are not the number of payment transactions or total company revenue.">
        {entries > 0 ? <Bars rows={[
          { label: 'App Store clicks', value: Number(homepage?.store_clicks), detail: `From ${count(entries)} tracked homepage entries · explicit clicks` },
          { label: 'Web analysis starts', value: Number(homepage?.web_starts), detail: `From ${count(entries)} tracked homepage entries` },
          { label: 'Entries with payment', value: Number(homepage?.paid_entries), detail: `From ${count(entries)} tracked homepage entries · server-confirmed payment` },
        ]} /> : <p className="admin-empty">No compatible homepage entries were recorded in this window. This does not mean the website had no visitors.</p>}
        <DataDetails><Table rows={(data.landingSources ?? []).map(row => ({ ...row, source: sourceName(row) }))} columns={['source', 'visitors', 'store_clicks', 'web_starts', 'paid_checkouts']} /><p className="mt-3 text-xs text-zinc-500">Top 30 homepage sources; counts refer to tracked entries, including entries with a paid checkout. Totals above are calculated independently of this limit.</p></DataDetails>
      </Panel>
      <Panel title="Homepage placement performance" description="Find the sections people reach and the buttons they choose.">
        <Disclosure className="admin-data-details"><DisclosureSummary>Explore sections and buttons</DisclosureSummary><AccordionContent><div className="admin-section-grid mt-4">
          <div><h3 className="mb-4 text-sm font-medium">Section reach</h3><Bars rows={(data.landingSections ?? []).map(row => ({ label: String(row.section), value: Number(row.visitors), detail: 'Tracked entries that saw at least 25% of the section' }))} /></div>
          <div><h3 className="mb-4 text-sm font-medium">CTA placements</h3><Bars rows={(data.landingPlacements ?? []).map(row => ({ label: `${row.placement} · ${row.destination}`, value: Number(row.visitors), detail: 'Tracked entries with this click; placements can overlap' }))} /></div>
        </div><p className="mt-4 text-xs leading-5 text-zinc-500">Uses the compatible homepage-entry cohort above. The same entry can reach or click several placements; do not add these rows together.</p></AccordionContent></Disclosure>
      </Panel>
    </>}
    <Panel title="Data sources & freshness" description="Observed traffic and snapshot generation are separate signals.">
      <dl className="grid gap-5 text-sm sm:grid-cols-2">
        <div><dt className="text-zinc-500">Snapshot generated</dt><dd className="mt-1 font-medium">{timestamp(data.generatedAt)}</dd></div>
        <div><dt className="text-zinc-500">Latest customer activity · {platform}</dt><dd className="mt-1 font-medium">{data.summary.latest_event ? timestamp(data.summary.latest_event) : 'No events observed in this window'}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks for updates every minute while visible and on return to this tab. Server snapshots use a 60-second cache with background revalidation; Refresh may initially return the previous snapshot. Latest activity is the selected platform’s client event time across customer activity, not server receipt time or proof that acquisition tracking is complete.</p>
      <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3"><Link href={detailHref('onboarding')} className={linkClass}>Onboarding →</Link><Link href={detailHref('quality')} className={linkClass}>Data health →</Link></div>
      <Disclosure className="admin-data-details"><DisclosureSummary>Tracking & audience diagnostics</DisclosureSummary><AccordionContent><h3 className="mt-5 text-sm font-medium">Tracking diagnostics</h3><EventReport data={data} section="Acquisition" /><Panel title="Website audience context" description="All web platforms; the platform filter does not apply. Browsers may visit multiple surfaces."><Table rows={data.webAudience ?? []} columns={['surface', 'browsers', 'pageviews']} /></Panel></AccordionContent></Disclosure>
    </Panel>
  </>
}
