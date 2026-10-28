import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { CreatorAttributionOverview } from './creator-attribution-overview'

const snapshot = (): AnalyticsDashboard => ({
  generatedAt: '2026-10-27T22:00:00Z', filters: { days: '30', platform: 'all', section: 'CreatorAttribution' },
  creatorAttribution: {
    creators: [{ creator_id: 'a', creator: 'Creator Alpha' }, { creator_id: 'b', creator: 'Creator Beta' }],
    summary: [
      { credit: 'direct', currency: 'USD', creator_id: null, net: 90, gross: 100, reversals: 10, paying_customers: 2, paying_creators: 2 },
      { credit: 'direct', currency: 'USD', creator_id: 'a', net: 40, paying_customers: 2, payments: 3 },
      { credit: 'direct', currency: 'USD', creator_id: 'b', net: 50, paying_customers: 1, payments: 1 },
      { credit: 'direct', currency: 'EUR', creator_id: null, net: 800, gross: 900, reversals: 100, paying_customers: 20 },
      { credit: 'first', currency: 'USD', creator_id: null, net: 999, paying_customers: 99 },
    ],
    traffic: [{ creator_id: null, visitors: 8, clicks: 10, active_creators: 2, unidentified_clicks: 2 }, { creator_id: 'a', visitors: 5 }, { creator_id: 'b', visitors: 5 }],
    daily: [], trafficDaily: [], accounts: [], milestones: [],
    coverage: [{ latest_event: '2026-10-27T21:30:00', latest_receipt: '2026-10-27T21:31:00', unallocated_payments: 2 }],
  },
} as unknown as AnalyticsDashboard)

test('creator attribution uses independently deduplicated totals and separate credit models and currencies', () => {
  const html = renderToStaticMarkup(<CreatorAttributionOverview data={snapshot()} days={30} />)
  expect(html).toContain('>$90.00</p>')
  expect(html).toContain('$100.00 gross · $10.00 refunds and disputes')
  expect(html).toContain('>8</p>')
  expect(html).not.toContain('>10</p>')
  expect(html).not.toContain('$999.00')
  expect(html).not.toContain('€800.00')
  expect(html).toContain('must not be added together')
  expect(html).toContain('distinct recorded billing identities')
})

test('empty observed report is recorded zero activity while a missing report remains unavailable', () => {
  const data = snapshot()
  data.creatorAttribution = { creators: [], summary: [], traffic: [], daily: [], trafficDaily: [], accounts: [], milestones: [], coverage: [] }
  const empty = renderToStaticMarkup(<CreatorAttributionOverview data={data} days={30} />)
  expect(empty).toContain('>0</p>')
  expect(empty).toContain('Recorded attributed revenue is zero')
  expect(empty).toContain('$0.00')
  data.creatorAttribution = undefined
  const missing = renderToStaticMarkup(<CreatorAttributionOverview data={data} days={30} />)
  expect(missing).toContain('could not be established')
  expect(missing).not.toContain('>0</p>')
})

test('scope, ingestion time and independent milestones stay clear', () => {
  const html = renderToStaticMarkup(<CreatorAttributionOverview data={snapshot()} days={30} />)
  expect(html).toContain('2:31 PM PDT')
  expect(html).toContain('All customer platforms')
  expect(html).toContain('not verified downloads')
  expect(html).toContain('not incremental revenue')
  expect(html).not.toContain('of paywalls')
  expect(html).not.toContain('NaN')
})
