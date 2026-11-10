import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { apiGet } from '@/lib/api/client'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import type { getWebJourneyDetail } from '@/lib/admin/web-journey-query'
import { formatStripePrice } from '@/lib/payments/subscription-prices'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AnalyticsChart, chartColors } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, percent, analyticsChannelLabel } from './analytics-ui'

export function WebJourneyDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const report = data.webJourney
  const [flow, setFlow] = useState<string | null>(null)
  const detail = useSWR<Awaited<ReturnType<typeof getWebJourneyDetail>>>(flow ? `/api/admin/web-journey?flowId=${encodeURIComponent(flow)}` : null, apiGet, { shouldRetryOnError: false })
  if (!report) return <Notice>Web journey data is unavailable. Missing observations are not measured zeros.</Notice>
  const s = report.summary[0]
  const coverage = report.coverage[0]
  const followup = report.postPurchase[0]
  const paid = Number(s?.paid_journeys || 0)
  const landing = Number(s?.landing_visitors || 0)
  const buyers = Number(s?.paid_landing_visitors || 0)
  const rows = report.funnel.map((row, i) => ({ stage: String(row.step), journeys: row.journeys, continuation: i ? percent(Number(row.journeys), Number(report.funnel[i - 1].journeys)) : '—', missing_next_stage: i < report.funnel.length - 1 ? Number(row.journeys) - Number(report.funnel[i + 1].journeys) : null }))
  const segmentRows = report.segments.map(row => ({ ...row, segment: report.dimension === 'channel' ? analyticsChannelLabel(row.segment) : row.segment, landing_to_paid: percent(Number(row.paid_landing_visitors), Number(row.landing_visitors)), analysis_to_subscription: percent(Number(row.subscribed_analysis), Number(row.analysis_opened)), paywall_to_checkout: percent(Number(row.analysis_checkouts), Number(row.analysis_paywalls)) }))
  const byChannel = (rows: MetricRow[]): MetricRow[] => rows.map(row => ({ ...row, channel: analyticsChannelLabel(row.channel) }))
  return <>
    <Notice>One row per observed journey, grouped by entry time. Version: {report.version}. A journey is not a unique person; repeat visits and existing-credit evaluations are separate considerations. No recorded next step means unconfirmed continuation, not a proven cancellation.</Notice>
    <div className="admin-stat-grid">
      <Stat title="Paid purchases per landing visitor" value={percent(buyers, landing)} note={`${count(buyers)} buyers / ${count(landing)} tracked homepage or creator-link visitors`} />
      <Stat title="Landing subscriptions" value={count(s?.subscribed_landing_visitors)} note={`${percent(Number(s?.subscribed_landing_visitors || 0), landing)} of landing visitors`} />
      <Stat title="Analysis → subscription" value={percent(Number(s?.subscribed_analysis), Number(s?.analysis_opened))} note={`${count(s?.subscribed_analysis)} Stripe-verified subscriptions / ${count(s?.analysis_opened)} analysis journeys; ${count(s?.analysis_paywalls)} reached the analysis paywall`} />
      <Stat title="Paid → evaluation" value={percent(Number(s?.evaluated), paid)} note="Completed on the server, linked to this journey" />
    </div>
    <Panel title="Web conversion funnel" description="The paid route from site or flow entry through Stripe confirmation and server-completed evaluation.">
      <Bars animated labelWidth={245} rows={report.funnel.map(row => ({ label: String(row.step), value: Number(row.journeys) }))} />
      <DataDetails><Table rows={rows} columns={['stage', 'journeys', 'continuation', 'missing_next_stage']} /></DataDetails>
      <p className="mt-4 text-xs leading-5 text-zinc-500">The funnel follows the web paywall route. {count(s?.store_attempts)} journeys attempted to open the App Store and {count(s?.store_fallbacks)} automatically continued to web capture. {count(s?.existing_access_journeys)} journeys used existing access; {count(s?.all_server_evaluated)} journeys have a server-completed evaluation across all routes. {count(s?.paid_without_ordered_browser_path)} journeys have a verified payment without the complete browser path and still count toward landing conversion when linked to a landing visitor.</p>
    </Panel>
    <Panel title="Conversion over time" description="Outcomes belong to the cohort’s entry date, rather than the date cash was collected.">
      <AnalyticsChart rows={report.daily} days={days} title="Web journey conversion" metrics={[{ key: 'landing_visitors', label: 'Landing visitors', color: chartColors.blue }, { key: 'paywalls', label: 'Paywall reached', color: chartColors.violet }, { key: 'paid_landing_visitors', label: 'Paid landing visitors', color: chartColors.green }]} />
    </Panel>
    <Panel title={`Conversion by ${label(report.dimension)}`} description="Compare counts alongside rates. Small samples and unobserved attribution do not establish a winning segment.">
      <Table rows={segmentRows} columns={['segment', 'landing_visitors', 'landing_to_paid', 'analysis_opened', 'analysis_paywalls', 'analysis_checkouts', 'paywall_to_checkout', 'paid_analysis', 'subscribed_analysis', 'analysis_to_subscription']} />
    </Panel>
    <Panel title="Paywall plans and prices" description="Journeys by browser, plan and displayed offer. Checkout conversion uses journeys that could select that plan. Stripe checkouts are matched to the latest eligible impression for the same journey, plan and offer.">
      <Table rows={byChannel(report.planOffers ?? []).map(row => ({
        ...row,
        offering: label(String(row.offering)),
        price: offerPrice(row.price, row.currency),
        first_payment_price: offerPrice(row.first_payment_price, row.currency),
        creator_discount: row.creator_discount === 'true' ? 'Shown' : '—',
        paywall_to_checkout: percent(Number(row.checkouts), Number(row.selectable)),
      }))} columns={['channel', 'browser', 'product', 'offering', 'price', 'first_payment_price', 'creator_discount', 'shown', 'selectable', 'default_journeys', 'checkouts', 'paywall_to_checkout', 'paid', 'discount_applied']} />
      <p className="mt-4 text-xs leading-5 text-zinc-500">A journey can see multiple plans or prices. “Discount applied” comes from the Stripe session. The first-payment price is the paywall quote, before any checkout taxes. Historical paywalls without plan impressions are excluded here.</p>
    </Panel>
    <Panel title="Onboarding screens" description="Screen views, explicit Continue actions, capture phases, and median time on screen. Raw profile answers are not collected.">
      <Table rows={byChannel(report.steps)} columns={['channel', 'step', 'viewed', 'completed', 'median_ms']} />
    </Panel>
    <Panel title="Checkout attempt outcomes" description="Each purchase attempt appears once. A verified Stripe payment supersedes browser errors or cancellation signals.">
      <Table rows={byChannel(report.outcomes)} columns={['channel', 'outcome', 'attempts']} />
    </Panel>
    <Panel title="After the first payment" description="Account-level follow-up for buyers linked to this cohort’s exact Stripe checkouts.">
      <div className="grid gap-6 sm:grid-cols-3"><Stat title="Paid accounts evaluated" value={percent(Number(followup?.accounts_evaluated), Number(followup?.paid_accounts))} note={`${count(followup?.accounts_evaluated)} of ${count(followup?.paid_accounts)} · server ledger, any eligible credit`} /><Stat title="Day 1 product return" value={percent(Number(followup?.d1_returned), Number(followup?.d1_eligible))} note={`${count(followup?.d1_returned)} of ${count(followup?.d1_eligible)} mature accounts`} /><Stat title="Day 7 product return" value={percent(Number(followup?.d7_returned), Number(followup?.d7_eligible))} note={`${count(followup?.d7_returned)} of ${count(followup?.d7_eligible)} mature accounts`} /></div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">Day 1 means 24–48 hours after payment; day 7 means 168–192 hours. Only fully elapsed windows enter each denominator. Return means an authenticated web product-page or product-usage event. Anonymous visits and activity on another platform are not inferred. This account follow-up is separate from exact journey-linked report delivery above.</p>
    </Panel>
    <Panel title="Friction and price loading" description="Failures before checkout remain visible, including camera, storage, pricing and evaluation issues.">
      <Table rows={byChannel(report.issues)} columns={['channel', 'event_name', 'stage', 'reason', 'journeys', 'events']} />
      <div className="mt-6"><Table rows={byChannel(report.catalog)} columns={['channel', 'mode', 'result', 'loads', 'journeys', 'median_ms']} /></div>
    </Panel>
    <Panel title="Inspect recent journeys" description="Open an event timeline without exposing photos, profile answers or account details.">
      {!report.journeys.length ? <p className="admin-empty">No journeys recorded for this version yet.</p> : <div className="divide-y divide-zinc-100">{report.journeys.map(row => <button key={String(row.flow_id)} type="button" onClick={() => setFlow(String(row.flow_id))} className="flex min-h-16 w-full flex-wrap items-center justify-between gap-3 py-3 text-left text-sm hover:bg-zinc-50">
        <span><span className="font-medium">Journey {String(row.flow_id).slice(-8)}</span><span className="mt-1 block text-xs text-zinc-500">{time(row.started)} · {row.browser} · {row.device} · {label(String(row.entry))}</span></span>
        <span className="text-xs text-zinc-600">{label(String(row.latest_milestone))} ↗</span>
      </button>)}</div>}
    </Panel>
    <Panel title="Measurement coverage" description="Keep old tracking gaps visible instead of manufacturing historical journeys.">
      <Table rows={report.versions} columns={['version', 'journeys']} />
      <p className="mt-4 text-sm leading-6 text-zinc-500">Across all versions, {count(coverage?.missing_flow)} of {count(coverage?.web_analysis_events)} web-analysis events lack a journey ID; {count(coverage?.unversioned)} lack a flow version. Latest event: {time(coverage?.latest_event)}. Counts reflect recorded customer events, with known internal and sandbox activity excluded. {count(coverage?.checkouts_missing_journey)} Stripe checkouts lack a journey ID. {count(coverage?.payments_missing_link)} verified Stripe payments lack a journey or account link.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{count(s?.verified_paid_sessions)} Stripe-paid sessions are linked to this entry cohort. Revenue, refunds, renewals and MRR use the billing ledger in <Link className="underline" href="/admin/analytics/revenue">Revenue</Link>; they must not be inferred from browser payment clicks. Recent cohorts have had less time to convert.</p>
    </Panel>
    <Dialog open={Boolean(flow)} onOpenChange={open => { if (!open) setFlow(null) }}><DialogContent className="max-h-[85dvh] max-w-4xl overflow-y-auto rounded-[28px] p-6">
      <DialogHeader><DialogTitle>Journey {flow?.slice(-8)}</DialogTitle><DialogDescription>Browser observations and server records, in event-time order. Server payment/access and evaluation events identify confirmed milestones.</DialogDescription></DialogHeader>
      {detail.error ? <Notice>Could not load this timeline. <button className="underline" onClick={() => void detail.mutate()}>Retry</button></Notice> : !detail.data ? <p>Loading journey…</p> : <><Table rows={detail.data.events.map(row => ({ ...row, at: time(row.at), event_name: label(String(row.event_name)), evidence: row.platform === 'server' ? `Server · ${row.source}` : 'Browser' }))} columns={['at', 'event_name', 'evidence', 'step', 'action', 'stage', 'product', 'reason', 'result', 'duration_ms']} />{detail.data.truncated ? <p className="text-xs text-zinc-500">Showing the first 300 events.</p> : null}</>}
    </DialogContent></Dialog>
  </>
}

function offerPrice(value: MetricRow[string], currency: MetricRow[string]) {
  if (typeof value !== 'string' || !/^\d{1,12}$/.test(value) || typeof currency !== 'string' || !/^[a-z]{3}$/i.test(currency)) return '—'
  return formatStripePrice(Number(value), currency, 'en-US')
}

function time(value: MetricRow[string] | undefined) {
  return typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : 'Not recorded'
}
