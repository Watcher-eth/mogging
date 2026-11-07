import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { WebJourneyDashboard } from './web-journey-dashboard'

test('web dashboard distinguishes legacy gaps, server-confirmed payment and mature retention', () => {
  const report = { version: 'legacy', dimension: 'browser', summary: [{ journeys: 0 }], funnel: [{ step: 'Payment verified', journeys: 0 }], daily: [], segments: [], steps: [], outcomes: [], postPurchase: [], issues: [], catalog: [], journeys: [], versions: [{ version: 'legacy', journeys: 0 }], coverage: [{ missing_flow: 12, web_analysis_events: 20 }] }
  const data = { webJourney: report } as unknown as AnalyticsDashboard
  const html = renderToStaticMarkup(<WebJourneyDashboard data={data} days={14} />)
  for (const text of ['Web conversion funnel','Payment verified','Onboarding screens','Checkout attempt outcomes','Day 7 product return','fully elapsed windows','Inspect recent journeys','Measurement coverage','not a proven cancellation']) expect(html).toContain(text)
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
  expect(html).not.toContain('0.0% of web journeys')
})
