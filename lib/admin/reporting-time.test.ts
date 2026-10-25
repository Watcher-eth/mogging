import { expect, test } from 'bun:test'
import { formatReportingTime } from './reporting-time'

const dateOptions = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
test('UTC midnight does not advance the Pacific reporting day', () => {
  expect(formatReportingTime(new Date('2026-10-25T00:30:00Z'), dateOptions)).toBe('10/24/2026')
  expect(formatReportingTime(new Date('2026-10-25T06:59:59Z'), dateOptions)).toBe('10/24/2026')
  expect(formatReportingTime(new Date('2026-10-25T07:00:00Z'), dateOptions)).toBe('10/25/2026')
  expect(formatReportingTime('2026-10-25T00:30:00', dateOptions)).toBe('10/24/2026')
  expect(formatReportingTime('2026-10-25T00:30:00+00:00', dateOptions)).toBe('10/24/2026')
})
test('winter midnight and repeated DST hours use the correct Pacific offset', () => {
  expect(formatReportingTime(new Date('2026-12-25T07:59:59Z'), dateOptions)).toBe('12/24/2026')
  expect(formatReportingTime(new Date('2026-12-25T08:00:00Z'), dateOptions)).toBe('12/25/2026')
  const timeOptions = { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } as const
  expect(formatReportingTime(new Date('2026-11-01T08:30:00Z'), timeOptions)).toBe('1:30 AM PDT')
  expect(formatReportingTime(new Date('2026-11-01T09:30:00Z'), timeOptions)).toBe('1:30 AM PST')
})
