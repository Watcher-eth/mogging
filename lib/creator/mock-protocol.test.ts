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

  test('keeps selected focus in every day and varies supporting tasks', () => {
    const eyes = buildMockProtocol('eyes', '2026-09-30')
    const jaw = buildMockProtocol('jaw', '2026-09-30')
    expect(eyes.every(day => day.items.some(task => task.title === 'Depuff eye area'))).toBe(true)
    expect(jaw.every(day => day.items.some(task => task.title === 'Sharpen lower third'))).toBe(true)
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
