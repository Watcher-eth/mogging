import { describe, expect, test } from 'bun:test'
import { buildMockProtocol, getScheduledRoutineItems, protocolFocusAreas } from './mock-protocol'

describe('mock weekly protocol', () => {
  test('creates seven calendar dates across month and year boundaries', () => {
    const days = buildMockProtocol('eyes', '2026-12-29')
    expect(days).toHaveLength(7)
    expect(days.map(day => day.date)).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04'])
    expect(days.map(day => day.items.length)).toEqual([2, 3, 2, 3, 2, 4, 3])
    expect(new Set(days.flatMap(day => day.items.map(task => task.id))).size).toBe(19)
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
})

test('mock and mobile share the same task selector and optional product rules', async () => {
  const { selectProtocolTasks } = await import('./protocol-tasks')
  const products = ['cleanser', 'moisturizer', 'uv-protection', 'retinol'] as const
  const days = buildMockProtocol('skin-age', '2026-09-30', [...products])
  for (const day of days) {
    expect(day.items.map(task => task.key)).toEqual(selectProtocolTasks({ focusIds: ['skin-age'], date: day.date, count: day.items.length, skinProducts: products }).map(task => task.key))
    expect(day.items.filter(task => task.family === 'skin-active').length).toBeLessThanOrEqual(1)
  }
  expect(days.flatMap(day => day.items).filter(task => task.key === 'retinol')).toHaveLength(2)
})
