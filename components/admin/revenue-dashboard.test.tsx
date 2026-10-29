import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { RevenueDashboard } from './revenue-dashboard'

function snapshot(): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T22:00:00Z', filters: { days: '30', platform: 'all', section: 'Revenue' },
    revenue: [{ currency: 'EUR', net: '700', gross: '800', refunds: '100', paying_customers: 5, missing_amount_events: 0 },
      { currency: 'USD', net: '90', gross: '100', refunds: '10', paying_customers: 2, missing_amount_events: 0 }],
    revenueTotals: [{ currency: 'EUR', net: '9000' }, { currency: 'USD', net: '500' }],
    revenueComparison: [{ currency: 'USD', current_net: '90', previous_net: '60', missing_amount_events: 0 }],
    revenueFinancials: [{ currency: 'USD', gross: 100, refunds: 10, after_refunds: 90, taxes: 0, fees: 13.5, proceeds: 76.5, known_proceeds: 76.5, unknown_fee_events: 0, commission_mismatches: 1 }],
    revenueSubscriptionOverview: [{ auto_renewing: 8, cancelling: 2, trials: 0, billing_retry: 0, access_total: 10, ended: 3, starting_subscriptions: 10, churned_starting_subscriptions: 2, ended_in_period: 3, cancellation_requests: 4 }],
    revenueSources: [{ source: 'Apple App Store', currency: 'USD', purchases: 3, refund_transactions: 1, gross: 100, refunds: 10, after_refunds: 90, proceeds: 76.5, provider_estimated_proceeds: 63 }],
    revenueCountries: [{ country: 'US', currency: 'USD', purchases: 3, refund_transactions: 1, gross: 100, refunds: 10, after_refunds: 90, proceeds: 76.5 }],
    revenueDaily: [], billingProducts: [], billingDimensions: [], billing: [],
    billingReporting: [{ missing_amount_events: 0, all_time_missing_amount_events: 0, unrecorded_stripe_purchases: 0,
      latest_event: '2026-10-27T21:30:00', latest_receipt: '2026-10-27T21:31:00', webhook_ready: 'true' }],
    revenueActivity: [
      { metric: 'active_subscriptions', total: 10, previous_24h: 9, unknown_status: 0 },
      { metric: 'scheduled_cancellations', total: 2, previous_24h: 1, unknown_status: 0 },
      { metric: 'canceled_subscriptions', total: 55 },
      { metric: 'new_subscriptions', total: 100, period_total: 7 },
      { metric: 'scans_bought', total: 200, period_total: 12 },
    ],
  } as unknown as AnalyticsDashboard
}

test('period revenue, lifetime totals and currencies remain distinct', () => {
  const html = renderToStaticMarkup(<RevenueDashboard data={snapshot()} days={30} />)
  expect(html).toContain('>$90.00</p>')
  expect(html).toContain('>$100.00</p>')
  expect(html).toContain('all-time after refunds: $500.00')
  expect(html).toContain('50.0% vs previous period')
  expect(html).toContain('Previous after refunds: $60.00')
  expect(html).not.toContain('$790.00')
  expect(html).toContain('>7</p>')
  expect(html).toContain('100 all time')
  expect(html).toContain('Cancelled · access remains')
  expect(html).toContain('>2</p>')
  expect(html).not.toContain('Canceled / discontinued')
  expect(html).toContain('2:31 PM PDT')
})

test('missing monetary amounts and missing Stripe purchases prevent a definitive growth claim', () => {
  const data = snapshot()
  data.revenueComparison![0].missing_amount_events = 1
  data.billingReporting![0].missing_amount_events = 1
  data.billingReporting![0].unrecorded_stripe_purchases = 3
  data.revenue.find(row => row.currency === 'USD')!.net = null
  const html = renderToStaticMarkup(<RevenueDashboard data={data} days={30} />)
  expect(html).toContain('3 live Stripe purchases are missing')
  expect(html).toContain('1 monetary billing events in this period')
  expect(html).toContain('Comparison unavailable')
  expect(html).not.toContain('50.0% vs previous period')
  expect(html).not.toContain('>$0.00</p>')
})

test('a lifetime currency with no period entries has recorded zero activity, not unknown amounts', () => {
  const data = snapshot()
  data.revenue = data.revenue.filter(row => row.currency !== 'USD')
  data.revenueComparison![0].current_net = '0'
  const html = renderToStaticMarkup(<RevenueDashboard data={data} days={30} />)
  expect(html).toContain('No billing events were recorded in USD')
  expect(html).toContain('>$0.00</p>')
  expect(html).toContain('all-time after refunds: $500.00')
})

test('zero and negative comparison baselines use finite, meaningful changes', () => {
  const data = snapshot()
  data.revenueComparison![0].previous_net = '0'
  const zero = renderToStaticMarkup(<RevenueDashboard data={data} days={30} />)
  expect(zero).toContain('+$90.00 vs previous period')
  expect(zero).not.toContain('Infinity')
  data.revenueComparison![0].previous_net = '-10'
  const negative = renderToStaticMarkup(<RevenueDashboard data={data} days={30} />)
  expect(negative).toContain('+$100.00 vs previous period')
})

test('subscription access with unknown expiry is qualified and empty money is not fabricated', () => {
  const data = snapshot()
  data.revenue = []
  data.revenueTotals = []
  data.revenueComparison = []
  data.revenueActivity![0].unknown_status = 4
  const html = renderToStaticMarkup(<RevenueDashboard data={data} days={30} />)
  expect(html).toContain('No verified monetary billing records')
  expect(html).toContain('4 expiries unconfirmed')
  expect(html).toContain('confirmed minimum')
  expect(html).not.toContain('>$0.00</p>')
  expect(html).not.toContain('NaN')
})


test('proceeds, renewal intent, churn and country totals have explicit independent definitions', () => {
  const html = renderToStaticMarkup(<RevenueDashboard data={snapshot()} days={30} />)
  expect(html).toContain('>$76.50</p>')
  expect(html).toContain('Active · set to renew')
  expect(html).toContain('>8</p>')
  expect(html).toContain('>20.0%</p>')
  expect(html).toContain('2 lost from 10 subscriptions')
  expect(html).toContain('United States')
  expect(html).toContain('Apple App Store')
  expect(html).toContain('15% App Store commission')
  expect(html).toContain('provider commission estimates that differ')
  expect(html).toContain('Proceeds are not business profit')
})

test('unknown processing fees cannot turn gross collections into profit', () => {
  const data = snapshot()
  Object.assign(data.revenueFinancials![0], { proceeds: null, unknown_fee_events: 2, known_proceeds: 50 })
  data.revenueSubscriptionOverview![0].starting_subscriptions = 0
  data.revenueSubscriptionOverview![0].churned_starting_subscriptions = 0
  const html = renderToStaticMarkup(<RevenueDashboard data={data} days={30} />)
  expect(html).toContain('Full proceeds are unavailable')
  expect(html).toContain('covered transactions contribute $50.00')
  expect(html).not.toContain('>$76.50</p>')
  expect(html).not.toContain('NaN')
})


test('headline comparisons show growth, decline and first-time paying customers for 24 hours', () => {
  const data = snapshot()
  Object.assign(data.revenueComparison![0], { current_gross: 100, previous_gross: 80,
    current_refunds: 10, previous_refunds: 20, current_paying_customers: 2, previous_paying_customers: 4,
    current_new_customers: 1, previous_new_customers: 0 })
  const html = renderToStaticMarkup(<RevenueDashboard data={data} days={1} />)
  expect(html).toContain('Last 24 hours')
  expect(html).toContain('New customers')
  expect(html).toContain('First recorded payment in this period · renewals excluded')
  expect(html).toContain('+25.0% versus previous 24 hours')
  expect(html).toContain('−50.0% versus previous 24 hours')
  expect(html).toContain('+1 versus previous 24 hours')
  data.revenueComparison![0].missing_amount_events = 1
  const incomplete = renderToStaticMarkup(<RevenueDashboard data={data} days={1} />)
  expect(incomplete).not.toContain('+25.0% versus previous 24 hours')
})
