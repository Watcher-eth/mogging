import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { CreatorEconomicsOverview } from './creator-economics-overview'

function snapshot(): AnalyticsDashboard {
  return { generatedAt: '2026-10-27T22:00:00Z', filters: { days: '30', platform: 'all', section: 'CreatorEconomics' }, creatorEconomics: {
    summary: [{ net: 90, paying_customers: 2, cash_paid: 60, scheduled: 40, lifetime_paid: 900, undated_paid: 1, other_currency_payments: 2 }],
    daily: [], creators: [{ creator_id: 'one', creator: 'Creator One', period_net: 90, period_payers: 2, period_paid: 60, lifetime_net: 1000, lifetime_payers: 10, lifetime_paid: 900, scheduled: 40 }],
    currencies: [{ currency: 'EUR', net: 700 }, { currency: 'USD', net: 90 }],
    sources: [], mobile: [], store: [], billing: [{ provider: 'revenuecat', status: 'missing_identity', events: 3 }],
    coverage: [{ latest_revenue_event: '2026-10-27T21:30:00', latest_revenue_receipt: '2026-10-27T21:31:00', latest_compensation_update: '2026-10-27T21:32:00', unallocated_payments: 3 }],
  } } as unknown as AnalyticsDashboard
}

test('economics keeps period revenue/cash, current scheduled payments, and lifetime totals separate', () => {
  const html = renderToStaticMarkup(<CreatorEconomicsOverview data={snapshot()} days={30} />)
  for (const value of ['$90.00', '$60.00', '$40.00', '$900.00', '$940.00']) expect(html).toContain(`>${value}</p>`)
  expect(html).toContain('before fees and taxes')
  expect(html).toContain('not profit, contribution margin, payback, CAC or causal ROAS')
  expect(html).toContain('Direct revenue credit')
  expect(html).not.toContain('Upload campaign CSV')
  expect(html).not.toContain('StoreCampaignImport')
})

test('zero recorded creator payers does not imply zero company revenue or a measured acquisition cost', () => {
  const data = snapshot()
  data.creatorEconomics!.summary[0].paying_customers = 0
  data.creatorEconomics!.summary[0].net = 0
  const html = renderToStaticMarkup(<CreatorEconomicsOverview data={data} days={30} />)
  expect(html).toContain('Acquisition cost per paying customer is not measurable')
  expect(html).toContain('does not establish zero company revenue')
  expect(html).not.toContain('Infinity')
  expect(html).not.toContain('NaN')
})

test('coverage, ingestion time, and suppressed store fields remain explicit; missing snapshots do not fabricate zero', () => {
  const data = snapshot()
  data.creatorEconomics!.store = [{ campaign: 'c-one', day: '2026-10-21', downloads: null, sales: null, currency: 'USD' }]
  const html = renderToStaticMarkup(<CreatorEconomicsOverview data={data} days={30} />)
  expect(html).toContain('2:32 PM PDT')
  expect(html).toContain('Suppressed values remain unavailable')
  expect(html).toContain('3 positive billing records')
  data.creatorEconomics = null
  const empty = renderToStaticMarkup(<CreatorEconomicsOverview data={data} days={30} />)
  expect(empty).toContain('could not be established')
  expect(empty).not.toContain('$0.00')
})
