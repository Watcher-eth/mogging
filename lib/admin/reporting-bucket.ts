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
