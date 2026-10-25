export const ADMIN_REPORTING_TIME_ZONE = 'America/Los_Angeles'

export function formatReportingTime(value: Date | string, options: Intl.DateTimeFormatOptions = {}) {
  // PostgreSQL JSON timestamps without an offset represent stored UTC values.
  const date = typeof value === 'string'
    ? new Date(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`)
    : value
  return date.toLocaleString('en-US', { timeZone: ADMIN_REPORTING_TIME_ZONE, ...options })
}
