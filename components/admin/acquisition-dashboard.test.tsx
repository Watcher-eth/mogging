import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { AcquisitionDashboard } from './acquisition-dashboard'

function snapshot(): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T21:00:00Z', filters: { days: '7', platform: 'all', section: 'Acquisition' },
    summary: { events: 500, actors: 200, first_opens: 30, evaluations: 0, failures: 0, latest_event: '2026-10-27T20:55:00' },
    acquisitionSummary: [{ devices: 200, website_visitors: 150, first_opens: 30, store_clickers: 20, sourced_devices: 100 }],
    acquisition: [{ source: 'example.com', campaign: 'launch', actors: 10, first_opens: 2, store_redirects: 3, purchase_actors: 1 }],
    landingSummary: [{ entries: 180, store_clicks: 20, web_starts: 10, paid_entries: 3 }],
    daily: [], landingSources: [], landingSections: [], landingPlacements: [], webAudience: [],
    eventMetrics: [], eventPlatforms: [], dimensions: [], contextCoverage: [],
  } as unknown as AnalyticsDashboard
}

test('headline coverage uses uncapped totals, not the displayed source rows', () => {
  const html = renderToStaticMarkup(<AcquisitionDashboard data={snapshot()} days={7} />)
  expect(html).toContain('50.0%')
  expect(html).toContain('100 of 200 observed devices')
  expect(html).toContain('100 observed devices have no reliable source')
  expect(html).toContain('180 tracked homepage entries')
  expect(html).not.toContain('10 tracked homepage entries')
  expect(html).toContain('not attributed to website clicks')
  expect(html).not.toContain('Homepage → App Store click')
  expect(html).toContain('1:55 PM PDT')
})

test('mobile filters explain unavailable website metrics and hide web cohort panels', () => {
  const data = snapshot()
  data.filters.platform = 'ios'
  const html = renderToStaticMarkup(<AcquisitionDashboard data={data} days={7} />)
  expect(html).toContain('Choose Web or All platforms')
  expect(html).not.toContain('What homepage visitors do next')
  expect(html).not.toContain('Homepage placement performance')
  expect(html).toContain('/admin/analytics/onboarding?days=7&amp;platform=ios')
})

test('creator links use readable labels in source details', () => {
  const data = snapshot()
  data.acquisition[0] = { ...data.acquisition[0], source: '7d7c3191-e8de-45bd-87ab-012345678901', source_label: 'Creator · example · tiktok' }
  const html = renderToStaticMarkup(<AcquisitionDashboard data={data} days={7} />)
  expect(html).toContain('Creator · example · tiktok')
  expect(html).not.toContain('7d7c3191-e8de-45bd-87ab-012345678901')
})

test('empty and missing summaries never imply perfect coverage or nonexistent traffic', () => {
  const data = snapshot()
  data.summary.events = 0
  data.acquisitionSummary = [{ devices: 0, website_visitors: 0, first_opens: 0, store_clickers: 0, sourced_devices: 0 }]
  data.landingSummary = [{ entries: 0, store_clicks: 0, web_starts: 0, paid_entries: 0 }]
  const empty = renderToStaticMarkup(<AcquisitionDashboard data={data} days={1} />)
  expect(empty).toContain('No customer activity was observed')
  expect(empty).toContain('This does not mean the website had no visitors')
  expect(empty).not.toContain('NaN')
  expect(empty).not.toContain('100.0%')
  data.acquisitionSummary = undefined
  const missing = renderToStaticMarkup(<AcquisitionDashboard data={data} days={7} />)
  expect(missing).toContain('Source totals are unavailable')
  expect(missing).toContain('source rows must not be used to infer a total')
})
