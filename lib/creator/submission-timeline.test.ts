import { expect, test } from 'bun:test'
import { groupSubmissionDays, submissionAge } from './submission-timeline'

test('groups unsorted uploads by local calendar day across a year boundary', () => {
  const now = new Date(2026, 0, 1, 12)
  const item = (id: string, date: Date) => ({ id, createdAt: date.toISOString() })
  const uploads = [item('old', new Date(2025, 11, 30)), item('yesterday', new Date(2025, 11, 31, 23)), item('today', new Date(2026, 0, 1)), item('later', new Date(2026, 0, 1, 10))]
  expect(groupSubmissionDays(uploads, now).map(day => [day.label, day.submissions.map(item => item.id)])).toEqual([
    ['Today', ['later', 'today']], ['Yesterday', ['yesterday']], ['30/12/2025', ['old']],
  ])
  expect(uploads[0].id).toBe('old')
})

test('abbreviates upload ages without negative or zero-unit labels', () => {
  const now = new Date('2026-10-22T12:00:00Z')
  const age = (days: number) => submissionAge(new Date(now.getTime() - days * 86_400_000).toISOString(), now)
  expect([-1, 0, 1, 21, 49, 90, 400].map(age)).toEqual(['Today', 'Today', '1d ago', '3W ago', '1M ago', '3M ago', '1Y ago'])
})

test('age and group agree after midnight across daylight saving', () => {
  const now = new Date(2026, 2, 9, 0, 30)
  const createdAt = new Date(2026, 2, 8, 23, 45).toISOString()
  expect(groupSubmissionDays([{ createdAt }], now)[0].label).toBe('Yesterday')
  expect(submissionAge(createdAt, now)).toBe('1d ago')
})
