export type ScanPlan = 'weekly' | 'monthly' | 'yearly'

export function validDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

// Clamp month ends without drifting (Jan 31 -> Feb 28 -> Mar 31), in UTC.
export function addCalendarMonths(anchor: Date, months: number): Date {
  const result = new Date(anchor)
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(anchor.getUTCDate(), lastDay))
  return result
}

export function scanPeriod(plan: ScanPlan, start: Date, end: Date, now = new Date()) {
  if (![start, end, now].every(date => Number.isFinite(date.getTime())) || start > now || end <= now || end <= start) return null
  // Weekly/monthly allowances follow the verified billing period. Annual billing
  // contains monthly allowances anchored to the start of that paid year.
  if (plan !== 'yearly') return { start, end, credits: plan === 'weekly' ? 1 : 2 }
  let month = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth()
  if (addCalendarMonths(start, month) > now) month--
  return {
    start: addCalendarMonths(start, month),
    end: new Date(Math.min(addCalendarMonths(start, month + 1).getTime(), end.getTime())),
    credits: 2,
  }
}
