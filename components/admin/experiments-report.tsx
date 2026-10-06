import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { landingExperiments } from '@/lib/analytics/landing'
import { landingExperimentRows, landingExperimentSummary } from '@/lib/admin/landing'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count } from './analytics-ui'

export function ExperimentsReport({ data }: { data: AnalyticsDashboard }) {
  return <>
    <Notice>One active test: 50% see the old homepage and 50% see the new one. Assignment is server-rendered and stays with the browser for 90 days. The earlier hero and download-button tests are archived. App Store clicks are a proxy for interest, not confirmed installs or app subscriptions.</Notice>
    {Number(data.filters.days) <= 7 ? <Notice>This window is too short for seven-day outcomes to mature. Use Last 30 or 90 days to assess conversion; short windows are useful for exposure and traffic checks.</Notice> : null}
    {landingExperiments.map(experiment => {
      const observations = data.landingExperiments ?? []
      const rows = landingExperimentRows(observations, experiment.id)
      const summary = landingExperimentSummary(observations, experiment.id, new Date(data.generatedAt))
      return <Panel key={experiment.id} title={experiment.name} description={`${summary.status} · ${experiment.id}`} note="Each visitor is one browser assignment, deduplicated across reloads in the selected window. Outcomes must follow exposure, match the experiment and variant, and occur within seven days; all observations must be in the selected period. Recent visitors are pending and excluded from mature rates. Paid checkout requires a server-confirmed payment with a positive amount. Confidence intervals express uncertainty, not the probability of a winner. Clearing cookies or switching devices creates another visitor. Ad blockers and missing events can affect results.">
        <p className="mb-5 text-sm text-[#73777d]">{experiment.status === 'active' ? `100% of homepage traffic · A/B split 50/50 · Review after at least ${experiment.minimumDays} days and ${count(experiment.minimumVisitors)} mature visitors per variant. These are collection checkpoints, not a guarantee of statistical power or a winning result.` : 'Historical results only · no new assignments.'}</p>
        <div className="admin-stats-grid"><Stat title="Exposed browsers" value={count(summary.total)} note={`${summary.elapsedDays} observed days in this window`} /><Stat title={experiment.status === 'active' ? "New minus old" : "Treatment minus control"} value={summary.difference} note="Mature App Store click rate difference" /><Stat title="Relative lift" value={summary.lift} note="Mature click rate · B relative to A" /></div>
        {summary.imbalance ? <Notice>The observed split is unexpectedly uneven (allocation check at p &lt; 0.001). Investigate delivery and tracking before interpreting results.</Notice> : null}
        <div className="admin-section-grid">
          <div><h3 className="mb-4 text-sm font-medium">Mature App Store click rate</h3><Bars maximum={100} format={value => `${value.toFixed(1)}%`} rows={rows.map(row => ({ label: String(row.variant), value: Number(row.mature) ? Number(row.mature_store_clicks) / Number(row.mature) * 100 : null, detail: `${count(row.mature_store_clicks)} clicks / ${count(row.mature)} mature browsers · ${experiment.status === 'active' ? '95' : '97.5'}% interval: ${row.interval}` }))} /></div>
          <div><h3 className="mb-4 text-sm font-medium">Traffic allocation</h3><Bars rows={rows.map(row => ({ label: String(row.variant), value: Number(row.visitors), detail: `${count(row.pending)} pending · ${count(row.paid_checkouts)} verified paid browser checkouts` }))} /></div>
        </div>
        <DataDetails><Table rows={rows} columns={['variant','visitors','store_clicks','observed_store_rate','mature','pending','mature_store_rate','interval','browser_starts','paywalls','checkouts','paid_checkouts']} /></DataDetails>
      </Panel>
    })}
  </>
}
