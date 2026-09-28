import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import useSWR from 'swr'
import { AdminPasswordGate } from '@/components/admin/admin-password-gate'
import { Button } from '@/components/ui/button'
import { apiGet, apiRequest, ApiClientError } from '@/lib/api/client'
import { getAuthSession } from '@/lib/auth/session'
import { isCreatorAdminEmail } from '@/lib/admin/creator-auth'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'

const tabs = ['Overview', 'Acquisition', 'Onboarding', 'Revenue', 'Retention', 'Quality'] as const
const count = (value: unknown) => Number(value ?? 0).toLocaleString('en-US', { maximumFractionDigits: 2 })
const percent = (numerator: number, denominator: number) => denominator ? `${(numerator / denominator * 100).toFixed(1)}%` : '—'
const control = 'h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500'
type Health = { pending_events: number; pending_billing_events: number; unfinished_webhooks: number;
  oldest_pending_event: string | null; last_revenuecat_receipt: string | null; last_stripe_receipt: string | null;
  configured: Record<string, boolean> }

export default function AnalyticsAdminPage() {
  const [days, setDays] = useState('30')
  const [platform, setPlatform] = useState('all')
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview')
  const [lockError, setLockError] = useState('')
  const access = useSWR<{ unlocked: boolean }>('/api/admin/creator/session', apiGet)
  const report = useSWR<AnalyticsDashboard>(access.data?.unlocked ? `/api/admin/analytics?days=${days}&platform=${platform}` : null, apiGet,
    { dedupingInterval: 60_000, revalidateOnFocus: false, shouldRetryOnError: false })
  const expired = report.error instanceof ApiClientError && report.error.status === 401
  const health = useSWR<Health>(access.data?.unlocked && !expired && tab === 'Quality' ? '/api/admin/analytics-health' : null, apiGet, { dedupingInterval: 60_000, shouldRetryOnError: false })
  async function lock() {
    try { await apiRequest('/api/admin/creator/session', { method: 'DELETE' }); await access.mutate() }
    catch { setLockError('Could not lock the workspace. Please retry.') }
  }
  if (access.error) return <Notice>Admin access could not be verified. Reload or sign in with an authorized account.</Notice>
  if (access.isLoading) return <Notice>Checking admin access…</Notice>
  if (!access.data?.unlocked || expired) return <AdminPasswordGate onUnlocked={() => { void access.mutate(); void report.mutate() }} />
  const data = report.data
  return <div className="pb-12">
    <Head><title>Analytics · Mogging admin</title><meta name="robots" content="noindex,nofollow" /></Head>
    <header className="mb-6 border-b border-zinc-200 pb-6">
      <nav aria-label="Admin sections" className="mb-6 flex gap-5 text-xs font-medium text-zinc-500">
        <Link href="/admin/creators" className="hover:text-black">Creators</Link><Link href="/admin/invites" className="hover:text-black">Invite codes</Link><span aria-current="page" className="text-black">Analytics</span>
      </nav>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Product & revenue · Production only</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-[-0.055em]">Analytics</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">From acquisition to retained value. First-party behavioral data and verified billing, with their boundaries visible.</p></div>
        <Button variant="outline" className="rounded-xl" onClick={() => void lock()}>Lock workspace</Button>
      </div>
    </header>
    {lockError ? <Notice>{lockError}</Notice> : null}
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <label className="grid gap-1.5 text-xs font-medium text-zinc-500">Time window<select className={control} value={days} onChange={event => setDays(event.target.value)}>{[7,30,90].map(day => <option key={day} value={day}>Last {day} days</option>)}</select></label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-500">Behavior platform<select className={control} value={platform} onChange={event => setPlatform(event.target.value)}>{['all','web','ios','android'].map(item => <option key={item} value={item}>{item === 'all' ? 'All platforms' : item === 'ios' ? 'iOS' : item === 'web' ? 'Web' : 'Android'}</option>)}</select></label>
      <Button variant="outline" className="h-10 rounded-xl" disabled={report.isValidating} onClick={() => void report.mutate()}>{report.isValidating ? 'Loading…' : 'Refresh'}</Button>
      <p className="ml-auto text-xs text-zinc-500" aria-live="polite">{data ? `Snapshot ${new Date(data.generatedAt).toLocaleTimeString('en-GB', { timeZone: 'UTC' })} UTC · cached up to 60s` : 'UTC reporting'}</p>
    </div>
    <nav aria-label="Analytics reports" className="mb-6 flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5">
      {tabs.map(item => <button key={item} aria-pressed={tab === item} onClick={() => setTab(item)} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tab === item ? 'bg-black text-white' : 'text-zinc-500 hover:bg-zinc-100'}`}>{item}</button>)}
    </nav>
    {report.error ? <Notice>Analytics could not load. Verify the analytics migration is applied and the database is available, then retry. No missing data is shown as zero.</Notice> : null}
    {!data ? !report.error ? <Notice>Loading the reporting snapshot…</Notice> : null : <>
      {!data.summary.events ? <Notice>No production behavioral events in this window. This is not evidence of zero users: verify ingestion and the released app version. Billing may still be available.</Notice> : null}
      {tab === 'Overview' ? <>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat title="Active devices / browsers" value={count(data.summary.actors)} note="Not deduplicated people across devices" />
          <Stat title="First app opens" value={count(data.summary.first_opens)} note="Observed new installations" />
          <Stat title="Completed evaluations" value={count(data.summary.evaluations)} note="Client-observed completion events" />
          <Stat title="Evaluation failures" value={count(data.summary.failures)} note="Failure events, not a cohort rate" />
        </div>
        <Panel title="Daily product activity" note="Distinct devices/browsers per UTC day. Missing days mean no observed events, not necessarily an outage."><Table rows={data.daily} columns={['day','actors','evaluations','purchase_completions']} /></Panel>
        <div className="mt-6 grid gap-6 lg:grid-cols-2"><Funnel title="Mobile activation" rows={data.onboarding} /><Funnel title="Paywall conversion" rows={data.paywall} /></div>
      </> : null}
      {tab === 'Acquisition' ? <div className="grid gap-6">
        <Funnel title="Web → store redirect" rows={data.web} />
        <Panel title="Acquisition signals" note="Top 50 first-touch creator link IDs / UTM sources and campaigns observed on events. An actor may appear in several rows. These are milestone counts, not joined attribution or conversion rates; redirects are not downloads."><Table rows={data.acquisition} columns={['source','campaign','actors','first_opens','store_redirects','purchase_actors']} /></Panel>
        <Notice>Creator creative-level reporting is still limited by the current link model. <Link href="/admin/creators" className="underline">Open creator admin</Link> for verified creator attribution and payout reporting.</Notice>
      </div> : null}
      {tab === 'Onboarding' ? <div className="grid gap-6">
        <Funnel title="Paywall conversion" rows={data.paywall} />
        <Panel title="Step activity" note="Unique devices per milestone in this window—not a sequential completion rate. Resumed flows can complete without a view inside the window."><Table rows={data.steps} columns={['step','viewed','completed','skipped','back_actions']} /></Panel>
        <Panel title="Screen exposure" note="Foreground exposure on recorded exits, not active attention. App termination may omit exits. Durations cap at 30 minutes; most-observed 30 screens."><Table rows={data.screens} columns={['screen','exits','median_ms','p90_ms']} /></Panel>
      </div> : null}
      {tab === 'Revenue' ? <div className="grid gap-6">
        <Notice>Billing includes all platforms regardless of the behavior filter. Provider-confirmed facts only; sandbox is excluded. Net here means gross minus recorded refunds, before fees/taxes—not accounting profit or MRR.</Notice>
        <Panel title="Revenue by currency" note="Never combined across currencies. Missing amounts remain unknown; duplicate provider events are deduplicated by the ledger."><Table rows={data.revenue} columns={['currency','gross','refunds','net','missing_amount_events']} /></Panel>
        <Panel title="Subscription lifecycle" note="Cancellation scheduled is intent; subscription expired is loss of access. Counts are observed events, not current subscriber balances."><Table rows={data.billing} columns={['provider','event','events','customers']} /></Panel>
      </div> : null}
      {tab === 'Retention' ? <div className="grid gap-6">
        <Panel title="Return after evaluation" note="Account cohorts anchored at their first evaluation observed in this window (not necessarily their first-ever evaluation). Exact D1/D7/D30 windows; only fully observed accounts are eligible. Meaningful return = report, completed protocol task, or evaluation.">
          <Table rows={data.retention.map(row => ({ ...row, rate: percent(Number(row.retained), Number(row.eligible)) }))} columns={['day','eligible','retained','rate']} />
        </Panel>
        <Panel title="When do subscribers cancel?" note="First cancellation intent observed in the window, relative to the first evaluation observed in that same window. Billing spans all platforms; evaluation history follows the behavior filter. This is not a churn rate."><Table rows={data.cancellations} columns={['timing','accounts']} /></Panel>
        <Panel title="Post-purchase value signals" note="Activity totals, not limited to currently paying users. Use these to inspect the value loop without treating share intent as a successful social post."><Table rows={data.actions} columns={['event','events','actors']} /></Panel>
      </div> : null}
      {tab === 'Quality' ? <div className="grid gap-6">
        <Panel title="Delivery & provider health" note="PostHog is optional for this dashboard. A backlog is expected if export is disabled; webhook counts and configuration flags do not prove end-to-end provider delivery.">
          {health.error ? <p role="alert" className="text-sm text-red-700">Health checks could not load.</p> : !health.data ? <p className="text-sm text-zinc-500">Loading health checks…</p> : <>
            <Table rows={[{ metric: 'Behavior events awaiting export', value: health.data.pending_events }, { metric: 'Billing events awaiting export', value: health.data.pending_billing_events }, { metric: 'Unfinished webhooks older than 10m', value: health.data.unfinished_webhooks }, { metric: 'Oldest behavior export backlog', value: health.data.oldest_pending_event }, { metric: 'Last RevenueCat receipt', value: health.data.last_revenuecat_receipt }, { metric: 'Last Stripe receipt', value: health.data.last_stripe_receipt }]} columns={['metric','value']} />
            <div className="mt-4 flex flex-wrap gap-2">{Object.entries(health.data.configured).map(([key, value]) => <span key={key} className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs">{label(key)}: {value ? 'Configured' : 'Not configured'}</span>)}</div>
          </>}
        </Panel>
        <Panel title="Release comparison" note="Observed evaluation latency includes backend/network work; it is not app startup, frame-time, or analytics-overhead measurement. Compare similar audiences and devices before drawing conclusions."><Table rows={data.releases} columns={['release','platform','actors','evaluations_started','evaluation_failures','median_evaluation_ms']} /></Panel>
        <Panel title="Snapshot diagnostics" note="Native enabled/disabled performance comparison is still a physical-device release gate, not completed by these charts.">
          <dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Aggregate query time</dt><dd className="mt-1 font-medium">{count(data.queryMs)} ms</dd></div><div><dt className="text-zinc-500">Behavioral events scanned</dt><dd className="mt-1 font-medium">{count(data.summary.events)}</dd></div><div><dt className="text-zinc-500">Newest behavioral event</dt><dd className="mt-1 font-medium">{data.summary.latest_event ? `${data.summary.latest_event} UTC` : 'No events'}</dd></div></dl>
        </Panel>
      </div> : null}
    </>}
  </div>
}

function Notice({ children }: { children: ReactNode }) { return <div role="status" className="mb-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-600">{children}</div> }
function Stat({ title, value, note }: { title: string; value: string; note: string }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-5"><p className="text-xs font-medium text-zinc-500">{title}</p><p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">{value}</p><p className="mt-3 text-xs leading-5 text-zinc-500">{note}</p></div> }
function Panel({ title, note, children }: { title: string; note: string; children: ReactNode }) { return <section className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"><h2 className="text-lg font-semibold tracking-tight">{title}</h2><p className="mb-5 mt-2 max-w-3xl text-xs leading-5 text-zinc-500">{note}</p>{children}</section> }
const label = (value: string) => value.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase())
function Table({ rows, columns }: { rows: MetricRow[]; columns: string[] }) {
  if (!rows.length) return <p className="py-5 text-sm text-zinc-500">No observations in this window.</p>
  return <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr className="border-b border-zinc-200">{columns.map(column => <th key={column} scope="col" className="whitespace-nowrap px-3 py-3 font-medium text-zinc-500">{label(column)}</th>)}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">{columns.map(column => <td key={column} className="max-w-64 break-words px-3 py-3 tabular-nums">{row[column] == null ? '—' : typeof row[column] === 'number' ? count(row[column]) : String(row[column])}</td>)}</tr>)}</tbody></table></div>
}
function Funnel({ title, rows }: { title: string; rows: AnalyticsDashboard['onboarding'] }) {
  const total = rows[0]?.actors ?? 0
  return <Panel title={title} note="Ordered milestones per device/browser; each step follows the prior step within 7 days of entry. All observations must fall inside the selected window. Recent entries are still maturing. Purchase completion is a UX signal, not verified revenue.">
    <ol className="space-y-4">{rows.map((row, index) => <li key={row.name}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span>{label(row.name)}</span><span className="shrink-0 tabular-nums">{count(row.actors)} · {percent(row.actors, total)}</span></div><div className="h-2 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-zinc-900" style={{ width: `${total ? row.actors / total * 100 : 0}%` }} /></div>{index > 0 ? <p className="mt-1 text-[11px] text-zinc-500">{percent(rows[index - 1].actors - row.actors, rows[index - 1].actors)} drop from previous step</p> : null}</li>)}</ol>
  </Panel>
}

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  const session = await getAuthSession(req, res)
  if (!session || !isCreatorAdminEmail(session.user?.email)) return { notFound: true }
  return { props: { session: { ...session, user: { ...session.user,
    name: session.user?.name ?? null, email: session.user?.email ?? null, image: session.user?.image ?? null,
  } } } }
}
