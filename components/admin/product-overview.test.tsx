import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { ProductOverview } from './product-overview'

function snapshot(paidDelivery: MetricRow[] = []): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T18:00:00Z', filters: { days: '7', platform: 'ios', section: 'Overview' },
    summary: { events: 100, actors: 40, first_opens: 12, evaluations: 999, failures: 8, latest_event: '2026-10-27T17:45:00' },
    daily: [], scanLedger: { summary: { started: 25, completed: 20, failed: 3, pending: 2, reports: 19 }, daily: [] },
    paidDelivery,
  } as unknown as AnalyticsDashboard
}

test('overview uses confirmed scans and mature payers while preserving drilldown filters', () => {
  const html = renderToStaticMarkup(<ProductOverview data={snapshot([
    { window_days: 7, eligible: 100, report_viewed: 1, report_generated: 2, pending: 0 },
    { window_days: 1, payers: 10, eligible: 4, report_viewed: 3, report_generated: 4, pending: 6 },
  ])} days={7} />)
  expect(html).toContain('First-time installs · observed')
  expect(html).toContain('>12</p>')
  expect(html).toContain('install proxy, not verified store downloads')
  expect(html).not.toContain('Paid customers viewing a report')
  expect(html).toContain('1 eligible payers without an observed report view within 24h')
  expect(html).toContain('6 payers awaiting a full 24h follow-up')
  expect(html).toContain('>20</p>')
  expect(html).not.toContain('999')
  expect(html).not.toContain('failed scans with credit returned')
  expect(html).toContain('restore credit only when the entitlement is eligible')
  expect(html).toContain('/admin/analytics/scans?days=7&amp;platform=ios')
  expect(html).not.toContain('Mobile activation')
  expect(html).not.toContain('Stored user reports')
  expect(html).not.toContain('Paywall conversion')
  expect(html).toContain('11:00 AM PDT')
  expect(html).toContain('10:45 AM PDT')
})

test('immature cohorts have no delivery rate; mature zero views remain zero', () => {
  const pending = renderToStaticMarkup(<ProductOverview data={snapshot([
    { window_days: 1, eligible: 0, report_viewed: 0, report_generated: 0, pending: 8 },
  ])} days={7} />)
  expect(pending).toContain('No payers with a full 24-hour follow-up')
  expect(pending).not.toContain('0.0%')
  expect(pending).toContain('8 payers awaiting a full 24h follow-up')
  const zero = renderToStaticMarkup(<ProductOverview data={snapshot([
    { window_days: 1, eligible: 4, report_viewed: 0, report_generated: 2, pending: 0 },
  ])} days={7} />)
  expect(zero).not.toContain('NaN')
  expect(zero).toContain('4 eligible payers without an observed report view')
})

test('missing behavior and payer data explain observation limits without hiding server scans', () => {
  const data = snapshot()
  data.summary = { events: 0, actors: 0, first_opens: 0, evaluations: 0, failures: 0, latest_event: null }
  const html = renderToStaticMarkup(<ProductOverview data={data} days={1} />)
  expect(html).toContain('No customer activity events were observed')
  expect(html).toContain('No events observed in this window')
  expect(html).toContain('No linked payer cohort returned')
  expect(html).toContain('>20</p>')
  expect(html).toContain('Last 24 hours')
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
})
