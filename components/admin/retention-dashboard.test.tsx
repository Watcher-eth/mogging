import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { RetentionDashboard } from './retention-dashboard'

function snapshot(): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T22:00:00Z', filters: { days: '90', platform: 'all', section: 'Retention' },
    retention: [
      { day: 1, cohort_accounts: 100, eligible: 80, pending: 20, retained: 20 },
      { day: 7, cohort_accounts: 100, eligible: 50, pending: 50, retained: 5 },
      { day: 30, cohort_accounts: 100, eligible: 0, pending: 100, retained: 0 },
    ],
    retentionWeekly: [{ day: '2026-10-19T07:00:00+00:00', cohort_accounts: 10, eligible: 4, pending: 6, retained: 1 }],
    retentionCoverage: [{ latest_linked_activity: '2026-10-27T21:30:00', latest_linked_receipt: '2026-10-27T21:31:00', linked_events: 1000, anonymous_events: 4000 }],
    featureRetention: [{ feature: 'courses', day: 7, cohort_accounts: 12, eligible: 4, retained: 1 }],
    membershipActivation: [{ window_days: 7, subscribers: 20, eligible: 10, pending: 10, first_protocol_action: 2, returned_for_second_scan: 1 }],
  } as unknown as AnalyticsDashboard
}

test('retention headlines use mature account denominators and keep pending cohorts separate', () => {
  const html = renderToStaticMarkup(<RetentionDashboard data={snapshot()} days={90} />)
  expect(html).toContain('>25.0%</p>')
  expect(html).toContain('>10.0%</p>')
  expect(html).toContain('5 returned / 50 eligible · 50 awaiting full follow-up')
  expect(html).toContain('0 returned / 0 eligible · 100 awaiting full follow-up')
  expect(html).toContain('>—</p>')
  expect(html).toContain('>100</p>')
  expect(html).toContain('Day-7 retention by weekly cohort')
  expect(html).not.toContain('Cancellation timing')
  expect(html).not.toContain('Value signals')
})

test('mature zero return is measured zero while empty cohorts have no rate', () => {
  const data = snapshot()
  data.retention = [{ day: 1, cohort_accounts: 10, eligible: 10, pending: 0, retained: 0 }]
  const html = renderToStaticMarkup(<RetentionDashboard data={data} days={90} />)
  expect(html).toContain('>0.0%</p>')
  expect(html).not.toContain('No mature scan cohorts')
  data.retention = []
  const empty = renderToStaticMarkup(<RetentionDashboard data={data} days={90} />)
  expect(empty).toContain('No mature scan cohorts')
  expect(empty).not.toContain('>0.0%</p>')
  expect(empty).not.toContain('NaN')
})

test('platform scope, client cohort source, account coverage and receipt times remain explicit', () => {
  const data = snapshot()
  data.filters.platform = 'ios'
  const html = renderToStaticMarkup(<RetentionDashboard data={data} days={90} />)
  expect(html).toContain('iOS')
  expect(html).toContain('All platforms.')
  expect(html).toContain('1,000 account-linked events and 4,000 events without an account')
  expect(html).toContain('2:31 PM PDT')
  expect(html).toContain('not subscription renewal or paid retention rates')
})
