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
  const period = monthlyScanPeriod(start, now, 2)
  return { ...period, end: new Date(Math.min(period.end.getTime(), end.getTime())) }
}

export function monthlyScanPeriod(start: Date, now: Date, credits: number) {
  let month = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth()
  if (addCalendarMonths(start, month) > now) month--
  return {
    start: addCalendarMonths(start, month),
    end: addCalendarMonths(start, month + 1),
    credits,
  }
}

// Four release windows per anchored billing month. The fourth scan remains available
// through the month boundary, including months longer than four weeks.
export function starterScanPeriod(anchor: Date, now: Date) {
  const month = monthlyScanPeriod(anchor, now, 4)
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const week = Math.min(3, Math.floor((now.getTime() - month.start.getTime()) / weekMs))
  return { start: new Date(month.start.getTime() + week * weekMs),
    end: week === 3 ? month.end : new Date(month.start.getTime() + (week + 1) * weekMs), credits: 1 }
}
