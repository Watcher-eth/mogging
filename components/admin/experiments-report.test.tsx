import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { ExperimentsReport } from './experiments-report'

function snapshot(mature = 1000): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T21:00:00Z', filters: { days: '30', platform: 'all', section: 'Experiments' },
    landingExperiments: ['a', 'b'].map((variant, index) => ({ experiment_id: 'landing_homepage_v3', variant,
      visitors: 1100, homepage_visitors: 1100, mature, mature_store_clicks: mature ? index ? 250 : 200 : 0,
      pending: 1100 - mature, paid_checkouts: index ? 3 : 2,
      first_exposure: '2026-10-01T12:00:00', latest_exposure: '2026-10-27T20:30:00',
    })), landingExperimentDaily: [], landingHandoffs: [],
  } as unknown as AnalyticsDashboard
}

test('active test leads with mature rates and effect size, without declaring a winner', () => {
  const html = renderToStaticMarkup(<ExperimentsReport data={snapshot()} />)
  expect(html).toContain('20.0%')
  expect(html).toContain('25.0%')
  expect(html).toContain('+5.0 pp')
  expect(html).toContain('200 awaiting a full seven-day follow-up')
  expect(html).toContain('Checkpoints met · review uncertainty')
  expect(html).toContain('not a winner declaration')
  expect(html).toContain('2,200 recorded browser assignments')
  expect(html).toContain('1:30 PM PDT')
  expect(html).not.toContain('id="landing_hero_v1"')
  expect(html).toContain('Explore downstream outcomes and exclusions')
})

test('immature cohorts have no rates or lift, even when assignments exist', () => {
  const data = snapshot(0)
  data.filters.days = '7'
  const html = renderToStaticMarkup(<ExperimentsReport data={data} />)
  expect(html).toContain('Both variants need eligible browsers')
  expect(html).toContain('2,200 awaiting a full seven-day follow-up')
  expect(html).toContain('Choose Last 30 or 90 days')
  expect(html).not.toContain('>0.0%</p>')
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
})

test('traffic imbalance stays prominent even with mature samples', () => {
  const data = snapshot()
  data.landingExperiments[1].visitors = 2200
  const html = renderToStaticMarkup(<ExperimentsReport data={data} />)
  expect(html).toContain('Check traffic allocation')
  expect(html).toContain('recorded split is unexpectedly uneven')
})

test('no observations remain unknown rather than a zero conversion result', () => {
  const data = snapshot()
  data.landingExperiments = []
  const html = renderToStaticMarkup(<ExperimentsReport data={data} />)
  expect(html).toContain('Awaiting first exposure')
  expect(html).toContain('No entries observed in this window')
  expect(html).toContain('Both variants need eligible browsers')
  expect(html).not.toContain('NaN')
})
