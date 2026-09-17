import { describe, expect, test } from 'bun:test'
import { addCalendarMonths, scanPeriod, validDate } from './scan-periods'
const date = (s: string) => new Date(s)

describe('scan allowance calendar', () => {
  test('weekly and monthly allowances end exactly at the paid billing boundary', () => {
    const start = date('2026-09-01T12:34:56Z'), end = date('2026-09-08T12:34:56Z')
    expect(scanPeriod('weekly', start, end, start)?.credits).toBe(1)
    expect(scanPeriod('monthly', start, end, start)?.credits).toBe(2)
    expect(scanPeriod('weekly', start, end, end)).toBeNull()
    expect(scanPeriod('monthly', start, end, date('2026-08-31Z'))).toBeNull()
  })
  test('annual has monthly buckets without rollover or end-of-month drift', () => {
    const start = date('2024-01-31T15:45:00Z'), end = date('2025-01-31T15:45:00Z')
    const feb = scanPeriod('yearly', start, end, date('2024-02-29T15:45:00Z'))!
    expect(feb.credits).toBe(2)
    expect(feb.start.toISOString()).toBe('2024-02-29T15:45:00.000Z')
    expect(feb.end.toISOString()).toBe('2024-03-31T15:45:00.000Z')
    const skipped = scanPeriod('yearly', start, end, date('2024-11-01T00:00:00Z'))!
    expect(skipped.credits).toBe(2)
    expect(skipped.start.toISOString()).toBe('2024-10-31T15:45:00.000Z')
    expect(scanPeriod('yearly', start, end, end)).toBeNull()
  })
  test('six calendar months, including leap years and short months', () => {
    expect(addCalendarMonths(date('2023-08-31T08:00:00Z'), 6).toISOString()).toBe('2024-02-29T08:00:00.000Z')
    expect(addCalendarMonths(date('2024-08-31T08:00:00Z'), 6).toISOString()).toBe('2025-02-28T08:00:00.000Z')
    expect(validDate('broken')).toBeNull()
    expect(validDate(null)).toBeNull()
    expect(scanPeriod('yearly', new Date(NaN), new Date(), new Date())).toBeNull()
  })
})
