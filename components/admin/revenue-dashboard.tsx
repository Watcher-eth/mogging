import { AnalyticsLink as Link } from './analytics-link'
import { useState } from 'react'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { DimensionReport } from './tracking-report'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, money } from './analytics-ui'

const revenueMetrics: ChartMetric[] = [
  { key: 'net', label: 'Net revenue', color: chartColors.green },
  { key: 'gross', label: 'Gross revenue', color: chartColors.blue },
  { key: 'refunds', label: 'Refunds and deductions', color: chartColors.orange },
]
const timestamp = (value: unknown) => typeof value === 'string' ? formatReportingTime(value, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'No record available'
const providerName = (provider: unknown) => provider === 'revenuecat' ? 'RevenueCat' : provider === 'stripe' ? 'Stripe' : label(String(provider))
const productName = (product: unknown) => {
  const id = String(product ?? '')
  if (['evaluation', 'mogging.evaluation'].includes(id)) return 'Single scan'
  if (['evaluation_pack_3', 'mogging.evaluation.pack3'].includes(id)) return 'Three-scan pack'
  if (['mobile_subscription_weekly', 'mogging.pro.weekly'].includes(id)) return 'Weekly subscription'
  if (['mobile_subscription_monthly', 'mogging.pro.monthly'].includes(id)) return 'Monthly subscription'
  if (['mobile_subscription_yearly', 'mogging.pro.yearly'].includes(id)) return 'Annual subscription'
  return id === 'Unknown product' || !id ? 'Unspecified product' : id
}
const amount = (value: unknown, currency: string) => !currency ? '—' : currency === 'UNKNOWN'
  ? value == null ? '—' : `${count(value)} (currency unspecified)` : money(value, currency)
function comparisonText(current: unknown, previous: unknown, currency: string, incomplete: boolean) {
  if (incomplete || current == null || previous == null) return 'Comparison unavailable'
  const now = Number(current), prior = Number(previous)
  if (!Number.isFinite(now) || !Number.isFinite(prior)) return 'Comparison unavailable'
  const change = now - prior
  if (prior > 0) return `${change > 0 ? '+' : ''}${(change / prior * 100).toFixed(1)}% vs previous period`
  if (change === 0) return 'No recorded change vs previous period'
  return `${change > 0 ? '+' : '−'}${amount(Math.abs(change), currency)} vs previous period`
}

export function RevenueDashboard({ data, days }: { data: AnalyticsDashboard; days: number }) {
  const [selectedCurrency, setSelectedCurrency] = useState('')
  const currencies = [...new Set([...(data.revenueTotals ?? []), ...(data.revenue ?? [])].map(row => String(row.currency)))].sort((a, b) => a === b ? 0 : a === 'USD' ? -1 : b === 'USD' ? 1 : a.localeCompare(b))
  const currency = currencies.includes(selectedCurrency) ? selectedCurrency : currencies[0] ?? ''
  const lifetime = data.revenueTotals?.find(row => row.currency === currency)
  const recorded = data.revenue?.find(row => row.currency === currency)
  // An absent group means no ledger events for a known currency in this window.
  // A present group with null amounts remains unknown.
  const period = recorded ?? (currency ? { gross: 0, refunds: 0, net: 0, paying_customers: 0, unidentified_payments: 0, missing_amount_events: 0 } : undefined)
  const comparison = data.revenueComparison?.find(row => row.currency === currency)
  const reporting = data.billingReporting?.[0]
  const incomplete = Number(reporting?.missing_amount_events ?? 0)
  const rows = (data.revenueDaily ?? []).filter(row => row.currency === currency)
  const products = (data.billingProducts ?? []).filter(row => row.currency === currency)
  const active = data.revenueActivity?.find(row => row.metric === 'active_subscriptions')
  const cancellations = data.revenueActivity?.find(row => row.metric === 'scheduled_cancellations')
  const subscriptions = data.revenueActivity?.find(row => row.metric === 'new_subscriptions')
  const scans = data.revenueActivity?.find(row => row.metric === 'scans_bought')
  const unknownStatus = Number(active?.unknown_status ?? 0)
  const missingPurchases = Number(reporting?.unrecorded_stripe_purchases ?? 0)
  const currencyLabel = currency === 'UNKNOWN' ? 'Unspecified currency' : currency

  return <>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
      <p className="text-xs leading-5 text-zinc-500">{days === 1 ? 'Last 24 hours' : `Last ${days} days`} · All platforms · Pacific time · Currencies reported separately</p>
      {currencies.length ? <AnalyticsSelect label="Currency" value={currency} onChange={setSelectedCurrency} options={currencies.map(value => ({ value, label: value === 'UNKNOWN' ? 'Unspecified currency' : value }))} /> : null}
    </div>
    {missingPurchases > 0 ? <Notice>{count(missingPurchases)} live Stripe purchases are missing from the billing ledger. Recorded revenue is incomplete until reconciliation succeeds.</Notice> : null}
    {incomplete > 0 ? <Notice>{count(incomplete)} monetary billing events in this period have no recorded amount across all currencies. Monetary totals exclude those unknown amounts.</Notice> : null}
    {currency === 'UNKNOWN' ? <Notice>These billing records do not identify a currency. Their amounts cannot be combined with other currency totals.</Notice> : null}
    {!currency ? <Notice>No verified monetary billing records are available. Subscription access is reported separately below.</Notice> : null}
    <div className="admin-stats-grid">
      <Stat title="Net revenue" value={amount(period?.net, currency)} note={`Selected period · before fees and taxes. All-time net: ${amount(lifetime?.net, currency)}`} />
      <Stat title="Gross revenue" value={amount(period?.gross, currency)} note="Selected period · recorded positive billing amounts" />
      <Stat title="Refunds and deductions" value={amount(period?.refunds, currency)} note="Selected period · recorded negative billing amounts" />
      <Stat title="Paying customers" value={count(period?.paying_customers)} note="Selected currency and period · distinct identified billing customers" />
    </div>
    {currency ? <p className="mb-5 text-sm leading-6 text-zinc-500">{comparisonText(comparison?.current_net, comparison?.previous_net, currency, Number(comparison?.missing_amount_events ?? 0) > 0 || missingPurchases > 0)}{comparison ? ` · Previous net: ${amount(comparison.previous_net, currency)} · equal ${days === 1 ? '24-hour' : `${days}-day`} windows` : ''}</p> : null}
    {currency && !recorded ? <p className="mb-5 text-xs text-zinc-500">No billing events were recorded in {currencyLabel} during this period. Period totals show recorded zero activity; all-time totals retain earlier history.</p> : null}
    {Number(period?.unidentified_payments ?? 0) > 0 ? <p className="mb-5 text-xs text-zinc-500">{count(period?.unidentified_payments)} positive payment records have no customer identifier and are excluded from the customer count.</p> : null}
    <Panel title="Revenue performance" description={`${days === 1 ? 'Hourly' : 'Daily'} billing activity · ${currencyLabel || 'No currency available'}`}
      note="Source: deduplicated, production provider-confirmed billing events. Net revenue is recorded positive amounts less refunds and other negative adjustments, before platform fees and taxes. These billing-event totals are not profit, MRR or ARR. Known internal accounts and sandbox billing are excluded. Revenue follows billing-event time in Pacific time; boundary buckets are partial. Missing buckets are omitted. Unknown amounts remain excluded rather than estimated. Paying customers are distinct account identities, or provider-scoped external identities where account linking is missing; cross-provider unlinked identities can represent the same person.">
      <AnalyticsChart title="Revenue performance" rows={rows} metrics={revenueMetrics} days={days} currency={currency || undefined} />
      <DataDetails><Table rows={rows.map(row => ({ ...row, gross: amount(row.gross, currency), refunds: amount(row.refunds, currency), net: amount(row.net, currency) }))} columns={['day', 'gross', 'refunds', 'net', 'missing_amount_events']} /></DataDetails>
    </Panel>
    <Panel title="Subscriptions and scan purchases" description="Subscription access is current. New subscriptions and scan credits follow the selected period. All currencies."
      note="Subscription access is reconstructed from recorded provider lifecycle events and expiry or grace-period dates, across all currencies. Active access can include trials and scheduled cancellations. Scheduled cancellations are a subset of active access and are not already-lost customers. Missing expiries remain unconfirmed. New paid subscriptions count each provider/subscription identity at its first recorded positive start, conversion or invoice, excluding renewals as a new subscription. Scan credits include one-off purchases; three-scan packs contribute three credits. These counts are not distinct people and lifetime totals are recorded history, not company age.">
      <div className="admin-stats-grid">
        <Stat title="Active subscription access" value={count(active?.total)} note={`Current confirmed paid or trial access · ${count(active?.previous_24h)} recorded 24h ago${unknownStatus ? ` · ${count(unknownStatus)} expiries unconfirmed` : ''}`} />
        <Stat title="Scheduled cancellations" value={count(cancellations?.total)} note={`Current active access set to end · ${count(cancellations?.previous_24h)} recorded 24h ago${Number(cancellations?.unknown_status ?? 0) ? ` · ${count(cancellations?.unknown_status)} expiries unconfirmed` : ''}`} />
        <Stat title="New paid subscriptions" value={count(subscriptions?.period_total)} note={`Selected period · renewals excluded · ${count(subscriptions?.total)} all time`} />
        <Stat title="Scan credits purchased" value={count(scans?.period_total)} note={`Selected period · one-off credits · ${count(scans?.total)} all time`} />
      </div>
      {unknownStatus > 0 ? <p className="text-xs leading-5 text-zinc-500">Active access is a confirmed minimum; missing expiry dates prevent a complete current balance.</p> : null}
    </Panel>
    <Panel title="Revenue by product and provider" description={`Selected period · ${currencyLabel || 'No currency available'} · net recorded revenue`}>
      <Bars labelWidth={220} animated format={value => amount(value, currency)} rows={[...products].sort((a, b) => Number(b.net ?? 0) - Number(a.net ?? 0)).slice(0, 8).map(row => ({ label: `${providerName(row.provider)} · ${productName(row.product)}`, value: row.net == null ? null : Number(row.net), detail: `${count(row.customers)} billing identities · ${count(row.missing_amount_events)} unknown amounts` }))} />
      <DataDetails><Table rows={products.map(row => ({ ...row, provider: providerName(row.provider), product_name: productName(row.product), gross: amount(row.gross, currency), refunds: amount(row.refunds, currency), net: amount(row.net, currency) }))} columns={['provider', 'product_name', 'product', 'events', 'customers', 'subscriptions', 'unlinked_events', 'gross', 'refunds', 'net', 'missing_amount_events']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Top eight groups in the chart; the report retains up to 100 provider/product/currency groups. Customer counts can overlap across products and must not be added. Headline totals are calculated independently of this limit.</p></DataDetails>
    </Panel>
    <Panel title="Reporting coverage and methodology" description="Billing observation times, currency detail and reconciliation status.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">
        <div><dt className="text-zinc-500">Snapshot generated</dt><dd className="mt-1 font-medium">{timestamp(data.generatedAt)}</dd></div>
        <div><dt className="text-zinc-500">Latest production billing event</dt><dd className="mt-1 font-medium">{timestamp(reporting?.latest_event)}</dd></div>
        <div><dt className="text-zinc-500">Latest billing record received</dt><dd className="mt-1 font-medium">{timestamp(reporting?.latest_receipt)}</dd></div>
      </dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Checks every minute while visible and on return to this tab. Snapshots use a 60-second cache with background revalidation. Event and receipt times cover recorded customer production billing across all currencies; fresh timestamps do not prove collection is complete.</p>
      <p className="mt-3 text-xs leading-5 text-zinc-500">{reporting ? `${count(reporting.all_time_missing_amount_events)} all-time monetary events have unknown amounts and are excluded from lifetime totals.` : 'Billing coverage could not be established from this snapshot.'}</p>
      {reporting?.webhook_ready === 'false' ? <Notice>The last Stripe recovery check reported an incomplete webhook configuration. Review billing delivery before relying on complete revenue totals.</Notice> : null}
      <Disclosure className="admin-data-details"><DisclosureSummary>View currency totals and billing diagnostics</DisclosureSummary><AccordionContent>
        <h3 className="mb-3 mt-6 text-sm font-medium">Currency totals</h3>
        <Table rows={currencies.map(value => { const current = data.revenue?.find(row => row.currency === value); const allTime = data.revenueTotals?.find(row => row.currency === value); return { currency: value, period_net: amount(current ? current.net : 0, value), lifetime_net: amount(allTime?.net, value), unknown_amounts: current?.missing_amount_events ?? 0 } })} columns={['currency', 'period_net', 'lifetime_net', 'unknown_amounts']} />
        <h3 className="mb-3 mt-6 text-sm font-medium">Reconciliation status</h3>
        <Table rows={[
          { metric: 'Live Stripe purchases missing from ledger', value: reporting?.unrecorded_stripe_purchases ?? null },
          { metric: 'Latest Stripe recovery check', value: timestamp(reporting?.recovery_checked_at) },
          { metric: 'Webhook configuration at last check', value: reporting?.webhook_ready === 'true' ? 'Ready' : reporting?.webhook_ready === 'false' ? 'Needs attention' : 'Not confirmed' },
        ]} columns={['metric', 'value']} />
        <h3 className="mb-3 mt-6 text-sm font-medium">Subscription lifecycle events</h3>
        <p className="mb-3 text-xs text-zinc-500">Events observed in the selected period across all currencies; these are not current subscriber balances or a churn rate.</p>
        <Table rows={(data.billing ?? []).map(row => ({ ...row, event: label(String(row.event)), provider: providerName(row.provider) }))} columns={['provider', 'event', 'events', 'customers']} />
        <h3 className="mb-3 mt-6 text-sm font-medium">All-time purchase and subscription context</h3>
        <Table rows={(data.revenueActivity ?? []).map(row => ({ ...row, metric: row.metric === 'canceled_subscriptions' ? 'Cancellation intent or ended access (overlapping status)' : label(String(row.metric)) }))} columns={['metric', 'total', 'period_total', 'last_24h', 'previous_24h', 'unknown_status']} />
        <DimensionReport title="Billing reasons and provider context" rows={data.billingDimensions ?? []} />
      </AccordionContent></Disclosure>
      <Link className="mt-5 inline-block text-sm font-medium text-[#008ac5] underline underline-offset-4" href="/admin/analytics/reliability">Backend reliability →</Link>
    </Panel>
  </>
}
