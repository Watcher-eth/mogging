import { sql, type SQL } from 'drizzle-orm'
import { ADMIN_REPORTING_TIME_ZONE } from './reporting-time'

// Stored timestamps are UTC without a timezone. Return actual UTC instants so
// chart positions remain unambiguous through both occurrences of a DST hour.
export function reportingBucket(timestamp: SQL, days: number) {
  const start = days === 1
    ? sql`date_trunc('hour', ${timestamp})`
    : sql`date_trunc('day', ${timestamp} at time zone 'UTC', ${ADMIN_REPORTING_TIME_ZONE}) at time zone 'UTC'`
  return sql`to_char(${start}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`
}

// Calendar buckets preserve real zero-activity days, partial boundary days and
// 23/25-hour Pacific days rather than stretching sparse observations together.
export function reportingCalendar(start: string, end: string, days: number) {
  const first = days === 1 ? sql`date_trunc('hour',${start}::timestamp)`
    : sql`date_trunc('day',${start}::timestamp at time zone 'UTC' at time zone ${ADMIN_REPORTING_TIME_ZONE})`
  const last = days === 1 ? sql`date_trunc('hour',${end}::timestamp-interval '1 microsecond')`
    : sql`date_trunc('day',(${end}::timestamp-interval '1 microsecond') at time zone 'UTC' at time zone ${ADMIN_REPORTING_TIME_ZONE})`
  const instant = days === 1 ? sql`bucket` : sql`bucket at time zone ${ADMIN_REPORTING_TIME_ZONE} at time zone 'UTC'`
  return sql`select to_char(${instant},'YYYY-MM-DD"T"HH24:MI:SS"Z"') as day
    from generate_series(${first},${last},${days === 1 ? '1 hour' : '1 day'}::interval) bucket`
}
