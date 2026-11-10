import { sql } from 'drizzle-orm'

export function separateBackendTelemetry() {
  return process.env.BACKEND_TELEMETRY_STORAGE === 'separate'
}

export function readSeparateBackendTelemetry() {
  return separateBackendTelemetry() || process.env.BACKEND_TELEMETRY_STORAGE === 'read-both'
}

// Keep history readable across promotion and rollback. Only one destination is
// written per event. Both tables can use their event and time indexes.
export function backendEventSource(separate: boolean) {
  return sql`(select event_name,environment,platform,source,occurred_at,properties
    from analytics_events where platform='server' and source='backend'
    ${separate ? sql`union all select event_name,environment,'server','backend',occurred_at,properties from backend_events` : sql``})`
}
