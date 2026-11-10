import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { ExperimentsReport } from './experiments-report'

function snapshot(mature = 1000): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T21:00:00Z', filters: { days: '30', platform: 'all', section: 'Experiments' },
    landingExperiments: ['a', 'b'].map((variant, index) => ({ experiment_id: 'landing_homepage_v4', variant,
      visitors: index ? 2800 : 1200, homepage_visitors: index ? 2800 : 1200, mature, mature_store_clicks: mature ? index ? 250 : 200 : 0,
      mature_paid_checkouts: mature ? index ? 3 : 2 : 0,
      pending: (index ? 2800 : 1200) - mature, paid_checkouts: index ? 3 : 2,
      first_exposure: '2026-10-01T12:00:00', latest_exposure: '2026-10-27T20:30:00',
    })), landingExperimentDaily: [], landingHandoffs: [],
  } as unknown as AnalyticsDashboard
}

test('active test leads with mature rates and effect size, without declaring a winner', () => {
  const html = renderToStaticMarkup(<ExperimentsReport data={snapshot()} />)
  expect(html).toContain('0.20%')
  expect(html).toContain('0.30%')
  expect(html).toContain('+0.10 pp')
  expect(html).toContain('Checkpoints met · review uncertainty')
  expect(html).toContain('4,000 assigned browsers')
  expect(html).toContain('1:30 PM PDT')
  expect(html).not.toContain('id="landing_hero_v1"')
  expect(html).toContain('30% old and 70% new')
})

test('immature cohorts have no rates or lift, even when assignments exist', () => {
  const data = snapshot(0)
  data.filters.days = '7'
  const html = renderToStaticMarkup(<ExperimentsReport data={data} />)
  expect(html).not.toContain('>0.0%</p>')
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
})

test('traffic imbalance stays prominent even with mature samples', () => {
  const data = snapshot()
  data.landingExperiments[1].visitors = 1200
  const html = renderToStaticMarkup(<ExperimentsReport data={data} />)
  expect(html).toContain('Check traffic allocation')
  expect(html).toContain('recorded allocation is unexpectedly uneven')
})

test('no observations remain unknown rather than a zero conversion result', () => {
  const data = snapshot()
  data.landingExperiments = []
  const html = renderToStaticMarkup(<ExperimentsReport data={data} />)
  expect(html).toContain('Awaiting first exposure')
  expect(html).toContain('No observed exposures in this period')
  expect(html).not.toContain('NaN')
})
