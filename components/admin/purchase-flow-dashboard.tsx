import {PurchaseBehaviorDashboard} from './purchase-behavior-dashboard'
import {TimeBars} from './time-bars'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, percent } from './analytics-ui'

const metrics: ChartMetric[] = [
  { key: 'attempts', label: 'Purchase attempts', color: chartColors.blue },
  { key: 'purchased', label: 'Observed purchases', color: chartColors.green },
  { key: 'activated', label: 'Access activated', color: chartColors.violet },
]
const outcomes: Record<string,string> = {
  existing_access: 'Existing purchase · access restored', activated: 'Purchase with access activated', activation_only: 'Activation observed · purchase unconfirmed',
  purchased_access_failed: 'Purchase with activation error', purchased_access_pending: 'Purchase · activation unconfirmed',
  account_required: 'Purchase · account required', cancelled: 'Store cancellation',
  preparation_failed: 'Error before store request', store_failed: 'Store or SDK error', pending: 'Awaiting payment approval',
  in_progress: 'Recent attempt · no outcome yet', unresolved: 'Outcome not recorded',
}
const names: Record<string,string> = {
  payment_failed: 'Payment attempt failed', checkout_expired: 'Checkout session expired', checkout_confirmed: 'Checkout completed · invoice owns revenue', billing_issue_started: 'Subscription invoice needs payment', not_recorded: 'Not recorded',
  unknown: 'Not recorded', subscription: 'Subscription', scan: 'Scan purchase', ios: 'iOS', android: 'Android',
  scan_upgrade: 'Scan upgrade', onboarding: 'Onboarding', post_report: 'After report',
  session_restore: 'Session restoration', purchase_preparation: 'Purchase preparation', store_purchase: 'Store purchase', activation: 'Access activation',
  price: 'Price too high', not_ready: 'Not ready to purchase', payment_trouble: 'Payment or store account issue', other: 'Other reason',
  restore_started: 'Purchase restore starts', restore_failed: 'Purchase restore errors', purchase_restored: 'Purchases restored', activation_code_redeemed: 'Activation codes redeemed',
  app_left_active_state: 'Last seen inactive / background', no_store_callback: 'Store requested · no callback recorded', recovery_unconfirmed: 'Recovery checked · no purchase confirmed', before_store_request: 'No store request recorded',
  consumed: 'Consumed', expired: 'Expired without consumption', awaiting: 'Awaiting consumption',
}
const name = (value: unknown) => names[String(value)] ?? outcomes[String(value)] ?? label(String(value))
const time = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No observation available'

export function PurchaseFlowDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const report = data.purchaseFlow
  if (!report) return <><PurchaseBehaviorDashboard report={data.purchaseBehavior} days={days}/><Notice>Purchase flow data could not be established from this snapshot. Unavailable data is not shown as zero.</Notice></>
  const summary = report.summary[0]
  const coverage = report.coverage[0]
  const unverified = Math.max(0, Number(summary?.purchased ?? 0) - Number(summary?.verified ?? 0))
  const chartMetrics = metrics
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · {data.filters.platform === 'all' ? 'iOS and Android' : name(data.filters.platform)} · Mobile diagnostics filter · Billing purchases below include every source</p>
    <nav aria-label="Purchase report sections" className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-600"><a className="underline underline-offset-4" href="#paid-purchases">Paid sales &amp; channels</a><a className="underline underline-offset-4" href="#mobile-purchases">Mobile checkout issues</a><a className="underline underline-offset-4" href="#stripe-purchases">Stripe payment signals</a></nav>
    <div id="paid-purchases"><PurchaseBehaviorDashboard report={data.purchaseBehavior} days={days}/></div>
    <h2 id="mobile-purchases" className="mb-5 mt-10 text-lg font-medium">Mobile purchase attempt diagnostics</h2>
    <div className="admin-stats-grid">
      <Stat title="Tracked purchase attempts" value={count(summary?.attempts)} note={`${count(summary?.devices)} distinct devices · retries remain separate attempts`} />
      <Stat title="Observed purchases" value={count(summary?.purchased)} note={Number(summary?.attempts) > 0 ? `${percent(Number(summary?.purchased),Number(summary?.attempts))} of tracked attempts · observed to date` : "Purchase rate unavailable · no tracked attempts"} />
      <Stat title="Billing-confirmed outcomes" value={count(summary?.verified)} note="RevenueCat transaction or unique account/product/request match · includes trial starts" />
      <Stat title="Access activated" value={count(summary?.activated)} note={Number(summary?.purchased) > 0 ? `${percent(Number(summary?.activated),Number(summary?.purchased))} of observed purchases · client activation signal` : "Activation rate unavailable · no observed purchases"} />
    </div>
    {unverified>0 ? <Notice>{count(unverified)} purchase / restore {unverified===1?'outcome has':'outcomes have'} a client success signal without matching provider proof. They remain unverified; paid sales and revenue use the billing ledger above.</Notice> : null}
    <p className="mb-5 text-sm leading-6 text-zinc-500">Store cancellations: {count(summary?.cancellations)} · Attempts with errors: {count(summary?.errors)} · Purchases without confirmed access activation: {count(summary?.access_unconfirmed)}. Outcomes may update as payments or activation complete.</p>
    <Panel title="Tracked mobile attempts" description={`${days === 1 ? 'Hourly' : 'Daily'} outcomes grouped by when each tracked attempt began`}
      note="Each distinct device, platform and attempt identifier defines one attempt. These totals cover the entire selected period, without the former 2,000-attempt timeline cap. Outcomes are observed through the snapshot; recent attempts have shorter follow-up and can still complete. They are not fixed-maturity conversion cohorts. Purchases include SDK returns (including existing purchases), purchase reconciliation or a production billing match, including trials. Missing callbacks can be recovered only from a unique account, product and store-request time match. Activation requires an observed client activation or successful reconciliation and a purchase signal on that same attempt. Store requests do not prove the payment sheet appeared. Only recorded attempt buckets are shown; absence does not establish zero usage or an outage. Boundary buckets are partial. Each series has separate bars, even when outcomes match.">
      {report.daily.length ? <TimeBars key={`${days}:${data.filters.platform}`} title="Mobile purchase attempts" rows={report.daily} metrics={chartMetrics} days={days} /> : <p className="admin-empty">No linked purchase attempts were recorded for this period and platform.</p>}
      <p className="mt-4 text-xs leading-5 text-zinc-500">{count(summary?.requested)} tracked attempts reached a store request. Purchase and activation rates use the same linked attempt population; they do not measure paywall-to-paying-customer conversion or revenue.</p>
      <DataDetails><Table rows={report.daily.map(row => ({ period: time(row.day), attempts: row.attempts, observed_purchases: row.purchased, access_activated: row.activated }))} columns={['period','attempts','observed_purchases','access_activated']} /></DataDetails>
    </Panel>
    <Panel title="Purchase follow-up" description="Recorded errors and missing evidence are separate problems">
      <div className="admin-stats-grid">
        <Stat title="Store / device restrictions" value={count(summary?.restricted)} note={`${percent(Number(summary?.restricted),Number(summary?.attempts))} of attempts · purchase not allowed`}/>
        <Stat title="Technical errors" value={count(summary?.technical_errors)} note={`${percent(Number(summary?.technical_errors),Number(summary?.attempts))} of attempts · includes access activation errors`}/>
        <Stat title="Missing final outcome" value={count(summary?.unresolved)} note={`${percent(Number(summary?.unresolved),Number(summary?.attempts))} of attempts · payment status unknown`}/>
        <Stat title="Purchase · access unconfirmed" value={count(summary?.access_unconfirmed)} note="Successful purchase signal; activation still needs confirmation"/>
      </div>
      <p className="text-sm leading-6 text-zinc-500">Unknown outcomes are not counted as failed payments or successful sales. Leaving the app during the native payment sheet does not establish cancellation. Pending approval is also separate.</p>
      {(report.interruptions?.length ?? 0)>0 ? <div className="mt-6"><h3 className="mb-3 text-sm font-medium">Where outcome tracking stops</h3><Table rows={report.interruptions!.map(row=>({build:row.release,platform:name(row.platform),last_stage:name(row.stage),last_evidence:name(row.evidence),attempts:row.attempts,devices:row.devices,oldest_attempt:time(row.oldest_attempt),latest_observation:time(row.latest_observation)}))} columns={['build','platform','last_stage','last_evidence','attempts','devices','oldest_attempt','latest_observation']}/></div>:null}
      {(report.builds?.length ?? 0)>0 ? <DataDetails><Table rows={report.builds!} columns={['release','platform','attempts','purchased','activated','cancellations','errors','unresolved','pending']}/></DataDetails>:null}
    </Panel>
    <Panel title="Purchase outcomes" description="The latest observed status of each tracked attempt. Every attempt appears once. These are mobile attempts, not all paid sales."
      note="An exact transaction from before the attempt is shown as restored access, not a new purchase. A later purchase or successful activation takes precedence over earlier cancellations or errors. Pending approval is separate from failure. A missing final result is recent for the first two minutes, then unresolved; neither classification establishes abandonment. Activation without a purchase signal remains separate. Billing confirmation establishes a matching recorded provider outcome, not necessarily a positive charge or net revenue.">
      <Bars animated labelWidth={230} rows={report.outcomes.map(row => ({ label: name(row.outcome), value: Number(row.attempts), detail: `${count(row.devices)} devices · ${percent(Number(row.attempts),Number(summary?.attempts))} of tracked attempts` }))} />
      <DataDetails><Table rows={report.outcomes.map(row => ({ outcome: name(row.outcome), attempts: row.attempts, devices: row.devices }))} columns={['outcome','attempts','devices']} /></DataDetails>
    </Panel>
    <Panel title="Purchase performance by paywall" description="Compare subscriptions and scan purchases across mobile purchase surfaces."
      note="Unknown purchase types remain unclassified. Purchase type and paywall come from the first recorded start event; older releases may omit them. Rates use each row’s tracked attempts, and all starts share the selected period rather than a fixed follow-up window. Device identities can appear on several paywalls or attempts. No ranking here establishes a causal paywall effect.">
      <Table rows={report.surfaces.map(row => ({ paywall: name(row.surface), purchase_type: name(row.purchase_type), platform: name(row.platform), attempts: row.attempts, observed_purchases: row.purchased, purchase_rate: percent(Number(row.purchased),Number(row.attempts)), billing_confirmed: row.verified, access_activated: row.activated, cancellations: row.cancellations }))} columns={['paywall','purchase_type','platform','attempts','observed_purchases','purchase_rate','billing_confirmed','access_activated','cancellations']} />
    </Panel>
    <Panel title="Purchase issues and recovery" description="Errors that still affect the latest attempt outcome, plus supporting recovery activity.">
      <Table rows={report.failures.map(row => ({ outcome: name(row.outcome), stage: name(row.stage), reason: name(row.reason), error_code: name(row.error_code), attempts: row.attempts, affected_devices: row.affected_devices }))} columns={['outcome','stage','reason','error_code','attempts','affected_devices']} />
      <DataDetails><h3 className="mb-3 text-sm font-medium">Cancellation feedback</h3><Table rows={report.feedback.map(row => ({ reason: name(row.reason), responses: row.responses }))} columns={['reason','responses']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Feedback is voluntary and requested at most weekly per device. One latest response per linked attempt is retained; later recovery can change its final outcome. These responses do not represent all cancellations.</p><h3 className="mb-3 mt-6 text-sm font-medium">Purchase restoration</h3><Table rows={report.support.map(row => ({ activity: name(row.event_name), events: row.events, devices: row.devices }))} columns={['activity','events','devices']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Restore events are separate observations, not new purchases or a sequential conversion funnel. Only observed activities are listed.</p><h3 className="mb-3 mt-6 text-sm font-medium">Web checkout handoffs</h3><Table rows={report.handoffs.map(row => ({ status: name(row.status), handoffs: row.handoffs, accounts: row.accounts }))} columns={['status','handoffs','accounts']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Stored handoffs created in the selected period, across all platforms, independent of the mobile platform filter. Consumption reflects account transfer, not payment confirmation or report delivery. Known internal accounts are excluded; this ledger has no runtime environment field. Account counts can overlap statuses.</p></DataDetails>
    </Panel>
    <section id="stripe-purchases"><Panel title="Stripe payment signals" description="Web checkout and invoice activity · independent of the mobile filter"
      note="These are provider events, not a second purchase funnel or a count of lost sales. A payment can fail then succeed. Checkout expiry does not prove a payment error, and a subscription invoice can fail outside checkout. Do not add these events to mobile errors or divide them by mobile attempts. Revenue includes confirmed charges only.">
      <Table rows={(report.stripeActivity ?? []).map(row=>({activity:name(row.event_name),reason:name(row.reason),events:row.events,customers:row.customers,latest_event:time(row.latest_event)}))} columns={['activity','reason','events','customers','latest_event']}/>
    </Panel></section>
    <Panel title="Data sources and freshness" description="Client tracking, transaction confirmation and measurement coverage.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Latest purchase activity',coverage?.latest_event],['Latest activity received',coverage?.latest_receipt]].map(([title,value]) => <div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
      <p className="mt-5 text-sm leading-6 text-zinc-500">{count(coverage?.paywall_devices)} devices recorded {count(coverage?.paywall_views)} paywall views. {count(coverage?.unlinked_starts)} purchase start events lack an attempt identifier or device identity and are outside linked attempt metrics. Paywall views and purchase starts are independent observations.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">Source: mobile customer analytics, RevenueCat production billing records, and stored web handoffs. Checks every minute while visible and on return to this tab; snapshots use a 60-second cache with background revalidation. Known internal and explicitly identified sandbox client activity are excluded. Legacy activity without runtime evidence remains included. Older releases and delayed events can leave outcomes unconfirmed; a missing provider match does not establish payment failure.</p>
      <DataDetails><Table rows={[
        { measurement: 'Recorded mobile purchase start events', value: coverage?.start_events ?? null },
        { measurement: 'Start events with detailed tracking', value: coverage?.detailed_starts ?? null },
        { measurement: 'Mobile purchase events without confirmed runtime provenance', value: coverage?.runtime_unconfirmed_events ?? null },
        { measurement: 'Attempts awaiting approval or a recorded result', value: summary?.incomplete ?? null },
        { measurement: 'Latest matched billing record received', value: time(coverage?.latest_billing_receipt) },
      ]} columns={['measurement','value']} /></DataDetails>
    </Panel>
  </>
}
