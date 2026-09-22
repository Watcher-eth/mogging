export type ProtocolDay = { date: string; tasks: { id: string; title: string; completed: boolean }[] }
export const PUSH_HOUR = 18
export const PUSH_WEEKDAYS = { protocol: 1, battle: 3, invite: 6 } as const

export function reminderFor(now: Date, timezone: string, days: ProtocolDay[]) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now).map(({ type, value }) => [type, value]))
  // One-hour local delivery window; a frequent cron accommodates half-hour/quarter-hour zones.
  if (Number(parts.hour) !== PUSH_HOUR) return null
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
  if (weekday === PUSH_WEEKDAYS.battle) return {
    kind: 'battle' as const, slot: date, title: 'Battle for the crown 👑',
    body: 'Swipe. Pick your winner. Decide who mogs.', target: 'battle',
  }
  if (weekday === PUSH_WEEKDAYS.invite) return {
    kind: 'invite' as const, slot: date, title: 'Who mogs in your friend group?',
    body: 'Invite your friends and settle it.', target: 'invite',
  }
  if (weekday !== PUSH_WEEKDAYS.protocol) return null
  const task = days.find(day => day.date === date)?.tasks.find(task => !task.completed)
  if (!task) return null
  return {
    kind: 'protocol' as const, slot: date, title: 'Your next move is waiting',
    body: `Still on today's protocol: ${task.title}. Make it count.`, target: 'protocol',
  }
}
