import { describe, expect, test } from 'bun:test'
import { reminderFor, normalizePushTimezone, type ProtocolDay } from './schedule'

const days: ProtocolDay[] = [{ date: '2026-09-21', tasks: [
  { id: 'first', title: 'Apply SPF', completed: true },
  { id: 'second', title: '10 chin tucks', completed: false },
] }]

describe('local-time push schedule', () => {
  test('retired Battle days never send a reminder; invitations remain available', () => {
    const battle = reminderFor(new Date('2026-09-23T18:15:00Z'), 'UTC', [])
    const invite = reminderFor(new Date('2026-09-26T18:45:00Z'), 'UTC', [])
    expect(battle).toBeNull()
    expect(invite?.target).toBe('invite')
    expect(invite?.body).not.toContain('mogs')
    expect(reminderFor(new Date('2026-09-30T18:15:00Z'), 'UTC', [])).toBeNull()
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
    expect(reminderFor(new Date('2026-09-27T01:00:00Z'), 'America/Los_Angeles', [])?.slot).toBe('2026-09-26')
    expect(reminderFor(new Date('2026-09-26T12:30:00Z'), 'Asia/Kolkata', [])?.target).toBe('invite')
    expect(reminderFor(new Date('2026-09-26T12:15:00Z'), 'Asia/Kathmandu', [])?.target).toBe('invite')
  })
  test('keeps 6pm wall-clock time across daylight-saving changes', () => {
    expect(reminderFor(new Date('2026-10-31T22:00:00Z'), 'America/New_York', [])?.target).toBe('invite')
    expect(reminderFor(new Date('2026-11-07T23:00:00Z'), 'America/New_York', [])?.target).toBe('invite')
    expect(reminderFor(new Date('2026-11-07T22:00:00Z'), 'America/New_York', [])).toBeNull()
  })
})


test('legacy ICU aliases and canonical zones schedule identically without database timezone evaluation', () => {
  for (const [alias, canonical, at] of [
    ['Asia/Saigon', 'Asia/Ho_Chi_Minh', '2026-10-31T11:00:00Z'],
    ['Europe/Kiev', 'Europe/Kyiv', '2026-10-31T16:00:00Z'],
  ]) {
    expect(normalizePushTimezone(alias)).toBe(canonical)
    expect(reminderFor(new Date(at), alias, [])).toEqual(reminderFor(new Date(at), canonical, []))
    expect(reminderFor(new Date(at), alias, [])?.kind).toBe('invite')
  }
})

test('invalid devices cannot prevent valid devices from receiving reminders', () => {
  const at = new Date('2026-10-31T18:00:00Z')
  expect(['Invalid/Timezone', 'UTC'].map(zone => reminderFor(at, zone, [])?.kind ?? null)).toEqual([null, 'invite'])
})

test('DST, fractional offsets, local dates, completed tasks and delivery window are respected', () => {
  expect(reminderFor(new Date('2026-11-03T02:00:00Z'), 'America/Los_Angeles', [
    { date: '2026-11-02', tasks: [{ id: 'one', title: 'Routine', completed: false }] },
  ])?.kind).toBe('protocol')
  expect(reminderFor(new Date('2026-10-31T12:30:00Z'), 'Asia/Kolkata', [])?.kind).toBe('invite')
  expect(reminderFor(new Date('2026-10-31T13:30:00Z'), 'Asia/Kolkata', [])).toBeNull()
  expect(reminderFor(new Date('2026-11-02T18:00:00Z'), 'UTC', [
    { date: '2026-11-02', tasks: [{ id: 'one', title: 'Routine', completed: true }] },
  ])).toBeNull()
})
