import { sql, type SQL } from 'drizzle-orm'

// Only exact, independently verified counts from the matching recording qualify.
export function verifiedRecordingViewCount(data: SQL, storageKey: SQL) {
  const count = sql`(${data}#>>'{metrics,totalViews}')`
  return sql<number | null>`case when ${data}->>'storageKey'=${storageKey}
    and ${data}#>>'{metricsVerified,totalViews}'='true'
    and ${data}#>>'{metricsVerified,totalViewsExact}'='true'
    and ${data}#>>'{metrics,totalViewsExact}'='true'
    and ${count} ~ '^[0-9]{1,10}$'
    then case when ${count}::bigint<=2000000000 then ${count}::bigint end end`
}
