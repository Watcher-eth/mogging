import { describe, expect, test } from 'bun:test'
import { dailyPoints, onboardingScreenRows, retentionRates } from './chart-data'
import { onboardingAnalyticsSteps } from '../analytics/onboarding'

describe('analytics chart data', () => {
  test('shows every onboarding screen in app order before any observations arrive', () => {
    const rows = onboardingScreenRows([])
    expect(rows.map(row => [row.step, row.screen])).toEqual(onboardingAnalyticsSteps.map(step => [...step]))
    expect(rows.every(row => row.viewed === 0 && row.mature === 0 && row.median_ms === null)).toBe(true)
    expect(rows.some(row => row.step === 'paywall_plans')).toBe(true)
  })
  test('merges partial screen observations by stable ID without hiding unobserved screens', () => {
    const rows = onboardingScreenRows([{ step: 'goals', screen: 'Old label', viewed: 5, continued: 3, mature: 2, dropped: 1, median_ms: 4500 }])
    expect(rows).toHaveLength(onboardingAnalyticsSteps.length)
    expect(rows.find(row => row.step === 'goals')).toMatchObject({ screen: 'Goals', viewed: 5, continued: 3, median_ms: 4500 })
    expect(rows.find(row => row.step === 'primer')?.viewed).toBe(0)
  })
  test('omits removed screens even when a cached response contains their observations', () => {
    const rows = onboardingScreenRows(['protocol_bridge', 'reveal', 'location'].map(step => ({ step, viewed: 10 })))
    expect(rows.some(row => ['protocol_bridge', 'reveal', 'location'].includes(String(row.step)))).toBe(false)
    expect(rows.find(row => row.step === 'commit')?.screen).toBe('Lock in (4 taps)')
  })
  test('uses ordered UTC timestamps and preserves negative refund days', () => {
    expect(dailyPoints([{ day: '2026-10-02', net: '-2.5' }, { day: '2026-10-01', net: '9.99' }], 'net')).toEqual([
      { time: Date.parse('2026-10-01T00:00:00Z') / 1000, value: 9.99 },
      { time: Date.parse('2026-10-02T00:00:00Z') / 1000, value: -2.5 },
    ])
  })
  test('never converts unknown or invalid amounts into zero observations', () => {
    expect(dailyPoints([{ day: '2026-10-01', net: null }, { day: '2026-10-02', net: '' }, { day: 'invalid', net: 10 }, { day: '2026-10-03', net: 'bad' }], 'net')).toEqual([])
    expect(dailyPoints([{ day: '2026-10-01', actors: 0 }], 'actors')[0]?.value).toBe(0)
    expect(dailyPoints([], 'actors')).toEqual([])
  })
  test('immature retention cohorts have no rate, while eligible zero returns stay zero', () => {
    expect(retentionRates([{ day: 1, eligible: 4, retained: 1 }, { day: 7, eligible: 3, retained: 0 }, { day: 30, eligible: 0, retained: 0 }]).map(row => row.value)).toEqual([25, 0, null])
  })
})
