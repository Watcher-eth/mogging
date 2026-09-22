import { describe, expect, test } from 'bun:test'
import { reminderFor, type ProtocolDay } from './schedule'

const days: ProtocolDay[] = [{ date: '2026-09-21', tasks: [
  { id: 'first', title: 'Apply SPF', completed: true },
  { id: 'second', title: '10 chin tucks', completed: false },
] }]

describe('local-time push schedule', () => {
  test('battle and invite each get a distinct weekly day and destination', () => {
    const battle = reminderFor(new Date('2026-09-23T18:15:00Z'), 'UTC', [])
    const invite = reminderFor(new Date('2026-09-26T18:45:00Z'), 'UTC', [])
    expect(battle?.target).toBe('battle')
    expect(invite?.target).toBe('invite')
    expect(battle?.slot).toBe('2026-09-23')
    expect(reminderFor(new Date('2026-09-30T18:15:00Z'), 'UTC', [])?.target).toBe('battle')
  })
  test('weekly protocol names the first unfinished task, never a completed task', () => {
    const reminder = reminderFor(new Date('2026-09-21T18:00:00Z'), 'UTC', days)
    expect(reminder?.target).toBe('protocol')
    expect(reminder?.body).toContain('10 chin tucks')
    expect(reminder?.body).not.toContain('SPF')
  })
  test('skips completed, empty, missing, and stale days', () => {
    const now = new Date('2026-09-21T18:00:00Z')
    expect(reminderFor(now, 'UTC', [])).toBeNull()
    expect(reminderFor(now, 'UTC', [{ ...days[0], tasks: [] }])).toBeNull()
    expect(reminderFor(now, 'UTC', [{ ...days[0], tasks: days[0].tasks.map(task => ({ ...task, completed: true })) }])).toBeNull()
    expect(reminderFor(new Date('2026-09-28T18:00:00Z'), 'UTC', days)).toBeNull()
  })
  test('only sends in the delivery hour on scheduled days', () => {
    for (const date of ['2026-09-23T17:59:59Z', '2026-09-23T19:00:00Z', '2026-09-22T18:00:00Z']) {
      expect(reminderFor(new Date(date), 'UTC', days)).toBeNull()
    }
  })
  test('uses the local date, including zones across midnight and fractional offsets', () => {
    expect(reminderFor(new Date('2026-09-24T01:00:00Z'), 'America/Los_Angeles', [])?.slot).toBe('2026-09-23')
    expect(reminderFor(new Date('2026-09-23T12:30:00Z'), 'Asia/Kolkata', [])?.target).toBe('battle')
    expect(reminderFor(new Date('2026-09-23T12:15:00Z'), 'Asia/Kathmandu', [])?.target).toBe('battle')
  })
  test('keeps 6pm wall-clock time across daylight-saving changes', () => {
    expect(reminderFor(new Date('2026-10-28T22:00:00Z'), 'America/New_York', [])?.target).toBe('battle')
    expect(reminderFor(new Date('2026-11-04T23:00:00Z'), 'America/New_York', [])?.target).toBe('battle')
    expect(reminderFor(new Date('2026-11-04T22:00:00Z'), 'America/New_York', [])).toBeNull()
  })
})
