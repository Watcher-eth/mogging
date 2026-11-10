import { expect, test } from 'bun:test'
import { normalizePushTimezone, reminderFor } from './schedule'

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
