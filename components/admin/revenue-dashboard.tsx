import { AnalyticsLink as Link } from './analytics-link'
import { useState } from 'react'
import { Disclosure, DisclosureSummary, AccordionContent } from '@/components/ui/accordion'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { AnalyticsSelect } from './analytics-select'
import { DimensionReport } from './tracking-report'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, money } from './analytics-ui'

const revenueMetrics: ChartMetric[] = [
  { key: 'net', label: 'After refunds', color: chartColors.green },
  { key: 'gross', label: 'Gross revenue', color: chartColors.blue },
  { key: 'refunds', label: 'Refunds', color: chartColors.orange },
  { key: 'proceeds', label: 'Estimated proceeds', color: '#71717a' },
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

function MetricChange({ current, previous, days, unavailable = false, lowerIsBetter = false, currency }: { current: unknown; previous: unknown; days: number; unavailable?: boolean; lowerIsBetter?: boolean; currency?: string }) {
  if (unavailable || current == null || previous == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return <span className="text-xs text-zinc-400">Comparison unavailable</span>
  const delta = Number(current) - Number(previous)
  const period = days === 1 ? '24 hours' : `${days} days`
  const text = delta === 0 ? '0%' : Number(previous) > 0 ? `${delta > 0 ? '+' : '−'}${Math.abs(delta / Number(previous) * 100).toFixed(1)}%` : `${delta > 0 ? '+' : '−'}${currency ? amount(Math.abs(delta), currency) : count(Math.abs(delta))}`
  const color = delta === 0 ? 'text-zinc-500' : (lowerIsBetter ? delta < 0 : delta > 0) ? 'text-emerald-700' : 'text-rose-600'
  return <span className={`text-xs font-medium tabular-nums ${color}`} title={`Compared with previous ${period}: ${currency ? amount(previous, currency) : count(previous)}`} aria-label={`${text} versus previous ${period}`}>{delta > 0 ? '↗ ' : delta < 0 ? '↘ ' : ''}{text}</span>
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
  const rows = (data.revenueDaily ?? []).filter(row => row.currency === currency).map((row): MetricRow => ({ ...row, proceeds: data.revenueProceedsDaily?.find(p => p.day === row.day && p.currency === currency)?.proceeds ?? null }))
  const financials = data.revenueFinancials?.find(row => row.currency === currency)
  const state = data.revenueSubscriptionOverview?.[0]
  const starting = Number(state?.starting_subscriptions ?? 0)
  const churned = Number(state?.churned_starting_subscriptions ?? 0)
  const countryName = (code: unknown) => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(code)) || String(code) } catch { return String(code) } }
  const products = (data.billingProducts ?? []).filter(row => row.currency === currency)
  const active = data.revenueActivity?.find(row => row.metric === 'active_subscriptions')
  const cancellations = data.revenueActivity?.find(row => row.metric === 'scheduled_cancellations')
  const subscriptions = data.revenueActivity?.find(row => row.metric === 'new_subscriptions')
  const scans = data.revenueActivity?.find(row => row.metric === 'scans_bought')
  const unknownStatus = Number(active?.unknown_status ?? 0)
  const missingPurchases = Number(reporting?.unrecorded_stripe_purchases ?? 0)
  const comparisonUnavailable = Number(comparison?.missing_amount_events ?? 0) > 0 || missingPurchases > 0
  const change = (metric: string, currencyValue?: string, lowerIsBetter = false) => <MetricChange current={comparison?.[`current_${metric}`]} previous={comparison?.[`previous_${metric}`]} days={days} currency={currencyValue} lowerIsBetter={lowerIsBetter} unavailable={comparisonUnavailable} />
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
    <div className="admin-stats-grid xl:!grid-cols-5">
      <Stat title="Revenue" change={change('gross', currency)} value={amount(period?.gross, currency)} note="Customer payments before refunds, fees and taxes" />
      <Stat title="Refunds and deductions" change={change('refunds', currency, true)} value={amount(period?.refunds, currency)} note="Selected period · recorded negative billing amounts" />
      <Stat title="After refunds" change={change('net', currency)} value={amount(period?.net, currency)} note={`Before fees and taxes · all-time after refunds: ${amount(lifetime?.net, currency)}`} />
      <Stat title="Estimated proceeds" value={amount(financials?.proceeds, currency)} note="After refunds, estimated store fees and transaction taxes" />
      <Stat title="New customers" value={currency ? count(comparison?.current_new_customers ?? 0) : '—'} change={change('new_customers')} note="First recorded payment in this period · renewals excluded" />
    </div>
    <p className="mb-5 text-xs leading-5 text-zinc-500">Amounts are in the selected original purchase currency, not a combined USD total. Estimated proceeds use a 15% App Store commission after recorded transaction taxes. Proceeds are not business profit: creator payouts, processing, AI, hosting and other operating costs are not deducted.</p>
    {Number(financials?.commission_mismatches ?? 0) > 0 ? <Notice>{count(financials?.commission_mismatches)} Apple billing events have provider commission estimates that differ from the 15% scenario. Check the Small Business Program effective date in Apple and RevenueCat before comparing proceeds.</Notice> : null}
    {Number(financials?.unknown_fee_events ?? 0) > 0 ? <Notice>Fee or tax data is missing for {count(financials?.unknown_fee_events)} transactions. Full proceeds are unavailable; the covered transactions contribute {amount(financials?.known_proceeds, currency)}. Missing fees are not treated as zero.</Notice> : null}
    {currency ? <p className="mb-5 text-sm leading-6 text-zinc-500">{comparisonText(comparison?.current_net, comparison?.previous_net, currency, Number(comparison?.missing_amount_events ?? 0) > 0 || missingPurchases > 0)}{comparison ? ` · Previous after refunds: ${amount(comparison.previous_net, currency)} · equal ${days === 1 ? '24-hour' : `${days}-day`} windows` : ''}</p> : null}
    {currency && !recorded ? <p className="mb-5 text-xs text-zinc-500">No billing events were recorded in {currencyLabel} during this period. Period totals show recorded zero activity; all-time totals retain earlier history.</p> : null}
    {Number(period?.unidentified_payments ?? 0) > 0 ? <p className="mb-5 text-xs text-zinc-500">{count(period?.unidentified_payments)} positive payment records have no customer identifier and are excluded from the customer count.</p> : null}
    <Panel title="Revenue performance" description={`${days === 1 ? 'Hourly' : 'Daily'} billing activity · ${currencyLabel || 'No currency available'}`}
      note="Source: deduplicated, production provider-confirmed billing events. After refunds means recorded positive payments less negative adjustments, before platform fees and transaction taxes. Estimated proceeds additionally deduct the displayed fee and tax assumptions. These billing-event totals are not business profit, MRR or ARR. Known internal accounts and sandbox billing are excluded. Revenue follows billing-event time in Pacific time; boundary buckets are partial. Missing buckets are omitted. Unknown amounts remain excluded rather than estimated. Paying customers are distinct account identities, or provider-scoped external identities where account linking is missing; cross-provider unlinked identities can represent the same person.">
      <AnalyticsChart title="Revenue performance" rows={rows} metrics={revenueMetrics} days={days} currency={currency || undefined} />
      <DataDetails><Table rows={rows.map(row => ({ ...row, gross: amount(row.gross, currency), refunds: amount(row.refunds, currency), net: amount(row.net, currency) }))} columns={['day', 'gross', 'refunds', 'net', 'missing_amount_events']} /></DataDetails>
    </Panel>
    <Panel title="Where the money goes" description={`${currencyLabel || 'No currency available'} · selected period`} note="Refunds are deducted once, on the recorded refund event date. Fee and tax reversals follow the signed refund amount. The 15% Apple commission is a planning assumption supplied by you; provider-reported proceeds remain visible for comparison. Actual bank proceeds require Apple financial reports. Stripe proceeds remain unknown until processor fee and tax information is available.">
      <Table rows={[
        { item: 'Customer payments', amount: amount(period?.gross, currency) },
        { item: 'Refunds and deductions', amount: amount(period?.refunds, currency) },
        { item: 'After refunds', amount: amount(period?.net, currency) },
        { item: 'Known transaction taxes, net of reversals', amount: amount(financials?.taxes, currency) },
        { item: 'Known estimated store fees, net of reversals', amount: amount(financials?.fees, currency) },
        { item: 'Estimated proceeds', amount: amount(financials?.proceeds, currency) },
      ]} columns={['item', 'amount']} />
    </Panel>
    <Panel title="Current subscriptions" description="All currencies · latest recorded state" note="Set to renew means unexpired paid access with no recorded cancellation or billing issue. It is not a guarantee of a successful renewal. Trials are separate. Cancelled subscriptions retain access until expiry; they are not yet churned. Subscription counts represent provider/subscription identities, not unique people. Missing lifecycle history can leave state unconfirmed.">
      <div className="admin-stats-grid">
        <Stat title="Active · set to renew" value={state ? count(state.auto_renewing) : '—'} note="Paid subscriptions without cancellation or billing retry" />
        <Stat title="Cancelled · access remains" value={state ? count(state.cancelling) : count(cancellations?.total)} note="Renewal turned off; access has not expired" />
        <Stat title="Active trials" value={state ? count(state.trials) : '—'} note="Not included in paid subscriptions set to renew" />
        <Stat title="Billing retry" value={state ? count(state.billing_retry) : '—'} note="Unresolved billing issue; renewal at risk" />
        <Stat title="Total active access" value={count(state?.access_total ?? active?.total)} note={`${unknownStatus ? `${count(unknownStatus)} expiries unconfirmed · ` : ''}Includes trials and cancelled-but-unexpired access${unknownStatus ? ' · confirmed minimum' : ''}`} />
        <Stat title="Ended subscriptions" value={state ? count(state.ended) : '—'} note="Expired or refunded; recorded history" />
      </div>
      <Table rows={(data.revenueSubscriptionProducts ?? []).map(row => ({ ...row, product: productName(row.product) }))} columns={['source', 'product', 'auto_renewing', 'cancelling', 'trials', 'billing_retry', 'ended', 'unknown_expiry']} />
    </Panel>
    <Panel title="Churn and new purchases" description="Selected period · all currencies" note="Start-cohort churn is the share of subscriptions with confirmed access at the start of the period that have ended by the snapshot cutoff. It excludes customers who joined and left within this period, and is not a cancellation-request rate. A reactivated subscription that still has access is not lost. No starting subscriptions means the rate is unavailable.">
      <div className="admin-stats-grid">
        <Stat title="Start-cohort churn" value={state && starting > 0 ? `${(churned / starting * 100).toFixed(1)}%` : '—'} note={`${count(churned)} lost from ${count(starting)} subscriptions active at period start`} />
        <Stat title="Ended in period" value={state ? count(state.ended_in_period) : '—'} note="Expired or refunded subscriptions, including new subscribers" />
        <Stat title="Cancellation requests" value={state ? count(state.cancellation_requests) : '—'} note="Distinct subscriptions with renewal turned off in this period" />
        <Stat title="New paid subscriptions" value={count(subscriptions?.period_total)} note={`${count(subscriptions?.total)} all time · renewals excluded`} />
        <Stat title="Paying customers" change={change('paying_customers')} value={count(period?.paying_customers)} note={`${currencyLabel} · distinct identified billing customers in this period`} />
        <Stat title="Scan credits purchased" value={count(scans?.period_total)} note={`${count(scans?.total)} all time · three-scan packs count as three credits`} />
      </div>
    </Panel>
    <Panel title="Revenue by product and provider" description={`Selected period · ${currencyLabel || 'No currency available'} · net recorded revenue`}>
      <Bars labelWidth={220} animated format={value => amount(value, currency)} rows={[...products].sort((a, b) => Number(b.net ?? 0) - Number(a.net ?? 0)).slice(0, 8).map(row => ({ label: `${providerName(row.provider)} · ${productName(row.product)}`, value: row.net == null ? null : Number(row.net), detail: `${count(row.customers)} billing identities · ${count(row.missing_amount_events)} unknown amounts` }))} />
      <DataDetails><Table rows={products.map(row => ({ ...row, provider: providerName(row.provider), product_name: productName(row.product), gross: amount(row.gross, currency), refunds: amount(row.refunds, currency), net: amount(row.net, currency) }))} columns={['provider', 'product_name', 'product', 'events', 'customers', 'subscriptions', 'unlinked_events', 'gross', 'refunds', 'net', 'missing_amount_events']} /><p className="mt-3 text-xs leading-5 text-zinc-500">Top eight groups in the chart; the report retains up to 100 provider/product/currency groups. Customer counts can overlap across products and must not be added. Headline totals are calculated independently of this limit.</p></DataDetails>
    </Panel>
    <Panel title="Revenue sources" description="Selected period · each source and original currency listed separately">
      <Table rows={(data.revenueSources ?? []).map(row => ({ source: row.source, currency: row.currency, purchases: row.purchases, refunds_count: row.refund_transactions, revenue: amount(row.gross, String(row.currency)), refunds: amount(row.refunds, String(row.currency)), after_refunds: amount(row.after_refunds, String(row.currency)), estimated_proceeds: amount(row.proceeds, String(row.currency)), provider_estimated_proceeds: amount(row.provider_estimated_proceeds, String(row.currency)) }))} columns={['source', 'currency', 'purchases', 'refunds_count', 'revenue', 'refunds', 'after_refunds', 'estimated_proceeds', 'provider_estimated_proceeds']} />
    </Panel>
    <Panel title="Currencies and purchase countries" description="Selected period · no currencies are added together" note="Country comes from billing-provider metadata and can be unknown. This is the purchase country, not necessarily the customer's current location. Apple Sales and Trends and RevenueCat may convert all currencies to USD with different rates; Apple financial reports also use fiscal months and settled transactions.">
      <h3 className="mb-3 text-sm font-medium">Currency totals</h3>
      <Table rows={currencies.map(value => { const current = data.revenue?.find(row => row.currency === value); const finance = data.revenueFinancials?.find(row => row.currency === value); const allTime = data.revenueTotals?.find(row => row.currency === value); return { currency: value, revenue: amount(current ? current.gross : 0, value), refunds: amount(current ? current.refunds : 0, value), after_refunds: amount(current ? current.net : 0, value), estimated_proceeds: amount(finance?.proceeds, value), lifetime_after_refunds: amount(allTime?.net, value) } })} columns={['currency', 'revenue', 'refunds', 'after_refunds', 'estimated_proceeds', 'lifetime_after_refunds']} />
      <h3 className="mb-3 mt-6 text-sm font-medium">Purchase countries</h3>
      <Table rows={(data.revenueCountries ?? []).map(row => ({ country: countryName(row.country), currency: row.currency, purchases: row.purchases, refund_transactions: row.refund_transactions, revenue: amount(row.gross, String(row.currency)), refunds: amount(row.refunds, String(row.currency)), after_refunds: amount(row.after_refunds, String(row.currency)), estimated_proceeds: amount(row.proceeds, String(row.currency)) }))} columns={['country', 'currency', 'purchases', 'refund_transactions', 'revenue', 'refunds', 'after_refunds', 'estimated_proceeds']} />
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
      <Disclosure className="admin-data-details"><DisclosureSummary>View billing diagnostics</DisclosureSummary><AccordionContent>
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
