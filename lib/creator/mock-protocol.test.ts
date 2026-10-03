import { describe, expect, test } from 'bun:test'
import { buildMockProtocol, getScheduledRoutineItems, protocolFocusAreas } from './mock-protocol'

describe('mock weekly protocol', () => {
  test('female and unconfirmed mock subjects never receive facial-hair tasks', () => {
    for (const person of [{ gender: 'female' as const, hasBeard: true }, { gender: 'male' as const, hasBeard: false }, {}]) {
      const days = buildMockProtocol('jaw', '2026-09-30', undefined, person)
      expect(days.flatMap(day => day.items).some(task => task.requiresBeard)).toBe(false)
    }
    const bearded = buildMockProtocol('jaw', '2026-09-30', undefined, { gender: 'male', hasBeard: true })
    expect(bearded.flatMap(day => day.items).some(task => task.requiresBeard)).toBe(true)
  })
  test('creates seven calendar dates across month and year boundaries', () => {
    const days = buildMockProtocol('eyes', '2026-12-29')
    expect(days).toHaveLength(7)
    expect(days.map(day => day.date)).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'])
    expect(days.every(day => day.items.length >= 1 && day.items.length <= 3)).toBe(true)
    expect(new Set(days.flatMap(day => day.items.map(task => task.id))).size).toBe(days.flatMap(day => day.items).length)
  })

  test('rotates relevant tasks for the selected focus rather than repeating a single exercise', () => {
    const eyes = buildMockProtocol('eyes', '2026-09-30')
    const jaw = buildMockProtocol('jaw', '2026-09-30')
    expect(eyes.every(day => day.items.some(task => task.focusIds.includes('eyes')))).toBe(true)
    expect(jaw.every(day => day.items.some(task => task.focusIds.includes('jaw')))).toBe(true)
    expect(eyes[0].items.map(task => task.id)).not.toEqual(eyes[1].items.map(task => task.id))
    expect(protocolFocusAreas.some(area => area.id === 'symmetry')).toBe(true)
  })

  test('every focus produces complete task copy and nonoverlapping mobile slots', () => {
    for (const focus of protocolFocusAreas) {
      for (const day of buildMockProtocol(focus.id, '2026-09-30')) {
        const scheduled = getScheduledRoutineItems(day.items, 6)
        expect(scheduled.every(({ item, hour, durationHours }) => item.title && item.detail && item.tips?.length && hour >= 7 && hour + durationHours <= 19)).toBe(true)
        expect(new Set(scheduled.map(item => item.hour)).size).toBe(scheduled.length)
      }
    }
  })

  test('rejects missing focus and invalid calendar dates', () => {
    expect(() => buildMockProtocol('unknown', '2026-09-30')).toThrow()
    for (const date of ['', '2026-02-30', 'not-a-date']) expect(() => buildMockProtocol('eyes', date)).toThrow()
  })

  test('overlapping weeks keep each calendar date’s task count and content stable', () => {
    const first = buildMockProtocol('jaw', '2026-12-29')
    const next = buildMockProtocol('jaw', '2026-12-30')
    for (const day of next.slice(0, 6)) {
      const prior = first.find(item => item.date === day.date)!
      expect(day.items.map(task => task.key)).toEqual(prior.items.map(task => task.key))
      expect(day.items.length).toBe(prior.items.length)
    }
  })
})

test('mock and mobile share the same task selector and optional product rules', async () => {
  const { selectProtocolTasks } = await import('./protocol-tasks')
  const products = ['cleanser', 'moisturizer', 'uv-protection', 'retinol'] as const
  const days = buildMockProtocol('skin-age', '2026-09-30', [...products])
  for (const day of days) {
    expect(day.items.map(task => task.key)).toEqual(selectProtocolTasks({ focusIds: ['skin-age'], date: day.date, skinProducts: products }).map(task => task.key))
    expect(day.items.filter(task => task.family === 'skin-active').length).toBeLessThanOrEqual(1)
  }
  expect(days.flatMap(day => day.items).filter(task => task.key === 'retinol')).toHaveLength(2)
})

test('personalized mock uses the shared concern gates and future-only adaptation', async () => {
  const { normalizeProtocolProfile, selectProtocolTasks } = await import('./protocol-tasks')
  const profile = normalizeProtocolProfile({ concerns: ['sparse-brows'], focusIds: ['eyes'], makeup: true, products: ['makeup'], confirmed: true })
  const feedback = [{ date: '2026-10-02', taskKey: 'brow-set', outcome: 'not-relevant' as const }]
  const checkIns = [{ date: '2026-10-02', effort: 'too-much' as const, change: 'same' as const, skinComfort: 'comfortable' as const }]
  const days = buildMockProtocol('eyes', '2026-10-02', [], {}, { profile, feedback, checkIns })
  for (const day of days) {
    const tasks = selectProtocolTasks({ focusIds: ['eyes'], date: day.date, profile, feedback, checkIns })
    expect(day.items.map(task => task.key)).toEqual(tasks.map(task => task.key))
    expect(day.items.every(task => task.reason)).toBe(true)
    expect(day.items.some(task => task.key === 'eye-depuff')).toBe(false)
    if (day.date > '2026-10-02') {
      expect(day.items.length).toBeLessThanOrEqual(1)
      expect(day.items.some(task => task.key === 'brow-set')).toBe(false)
    }
  }
})

test('personalized mock schedules have fuller varied days and automatically target the chosen area', async () => {
  const { normalizeProtocolProfile } = await import('./protocol-tasks')
  for (const focus of ['jaw', 'eyes', 'skin-age', 'face-shape']) {
    const profile = normalizeProtocolProfile({ minutes: 5 })
    const weeks = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].flatMap(date => buildMockProtocol(focus, date, [], {}, { profile }))
    for (let day = 1; day < weeks.length; day++) {
      if (weeks[day - 1].items.length === 1) expect(weeks[day].items.length).toBeGreaterThanOrEqual(2)
      expect(weeks[day].items.length).toBeLessThanOrEqual(3)
      expect(weeks[day].items.map(item => item.key).sort()).not.toEqual(weeks[day - 1].items.map(item => item.key).sort())
    }
    if (focus === 'jaw') expect(weeks.some(day => day.items.some(item => item.family === 'neck-control'))).toBe(true)
  }
})
