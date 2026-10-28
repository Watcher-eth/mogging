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
  expect(html).toContain('All-time net: $500.00')
  expect(html).toContain('50.0% vs previous period')
  expect(html).toContain('Previous net: $60.00')
  expect(html).not.toContain('$790.00')
  expect(html).toContain('>7</p>')
  expect(html).toContain('100 all time')
  expect(html).toContain('Scheduled cancellations')
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
  expect(html).toContain('All-time net: $500.00')
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
