import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { OnboardingDashboard } from './onboarding-dashboard'

function snapshot(): AnalyticsDashboard {
  return {
    generatedAt: '2026-10-27T21:00:00Z', filters: { days: '30', platform: 'all', section: 'Onboarding' },
    onboardingSummary: [{ started: 120, completed: 45, eligible: 50, eligible_completed: 20, pending: 70,
      start_events: 140, compatible_start_events: 130, latest_event: '2026-10-27T20:30:00' }],
    onboardingDaily: [], onboarding: [],
    onboardingScreens: [{ step: 'primer', viewed: 80, continued: 60, mature: 50, dropped: 10, pending: 10 },
      { step: 'authentication', viewed: 8, continued: 6, mature: 8, dropped: 2, pending: 0 }],
    onboardingRevisions: [], onboardingFriction: [], steps: [], screens: [],
    eventMetrics: [], eventPlatforms: [], dimensions: [], contextCoverage: [],
  } as unknown as AnalyticsDashboard
}

test('completion rate uses mature flows rather than all starts or all completions', () => {
  const html = renderToStaticMarkup(<OnboardingDashboard data={snapshot()} days={30} />)
  expect(html).toContain('40.0%')
  expect(html).not.toContain('37.5%')
  expect(html).toContain('20 of 50 flows with a full seven-day follow-up')
  expect(html).toContain('>45</p>')
  expect(html).toContain('>70</p>')
  expect(html).toContain('130 of 140 recorded mobile start events')
  expect(html).toContain('1:30 PM PDT')
  expect(html).toContain('Legacy screen observations')
  expect(html).toContain('View tracking coverage and diagnostic details')
  expect(html).toContain('/admin/analytics/purchases?days=30&amp;platform=all')
})

test('recent flows have no mature rate; eligible zero completion is a measured zero', () => {
  const data = snapshot()
  data.onboardingSummary![0] = { ...data.onboardingSummary![0], eligible: 0, eligible_completed: 0 }
  const recent = renderToStaticMarkup(<OnboardingDashboard data={data} days={7} />)
  expect(recent).toContain('Available after a full seven-day follow-up')
  expect(recent).not.toContain('>0.0%</p>')
  expect(recent).toContain('Use Last 30 or 90 days')
  data.onboardingSummary![0].eligible = 50
  const zero = renderToStaticMarkup(<OnboardingDashboard data={data} days={30} />)
  expect(zero).toContain('>0.0%</p>')
  expect(zero).toContain('0 of 50 flows')
})

test('empty or missing cohorts preserve unknown states and observation limits', () => {
  const data = snapshot()
  data.onboardingScreens = []
  data.onboardingSummary = [{ started: 0, completed: 0, eligible: 0, eligible_completed: 0, pending: 0, start_events: 0, compatible_start_events: 0, latest_event: null }]
  const empty = renderToStaticMarkup(<OnboardingDashboard data={data} days={30} />)
  expect(empty).toContain('No compatible onboarding starts')
  expect(empty).toContain('Drop-off rates are not yet available')
  expect(empty).not.toContain('NaN')
  expect(empty).not.toContain('Infinity')
  data.onboardingSummary = undefined
  const missing = renderToStaticMarkup(<OnboardingDashboard data={data} days={30} />)
  expect(missing).toContain('Cohort coverage is unavailable')
})

test('web selection explicitly distinguishes mobile onboarding scope', () => {
  const data = snapshot()
  data.filters.platform = 'web'
  const html = renderToStaticMarkup(<OnboardingDashboard data={data} days={30} />)
  expect(html).toContain('These onboarding cohorts cover the mobile app')
})
