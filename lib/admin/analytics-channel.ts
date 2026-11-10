import { sql, type SQL } from 'drizzle-orm'

// Older browser events have OS categories but lack the explicit web surface.
export function webChannel(properties: SQL, historicalDevice = false) {
  return sql`case when ${properties}->>'web_surface' in ('mobile_web','desktop_web') then ${properties}->>'web_surface'
    ${historicalDevice ? sql`when ${properties}->>'device_platform' in ('ios','android') then 'mobile_web'
      when ${properties}->>'device_platform'='desktop' then 'desktop_web'` : sql``}
    end`
}
