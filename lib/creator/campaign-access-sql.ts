import { sql } from 'drizzle-orm'

// Apply before limits and aggregation. Profile IDs come only from authenticated sessions.
export function campaignAccessSql(creatorId?: string | null) {
  return sql`(creator_sprints.audience->>'mode' = 'all'
    or (creator_sprints.audience->>'mode' = 'selected' and creator_sprints.audience->'creatorIds' ? ${creatorId ?? ''})
    or (creator_sprints.audience->>'mode' = 'except' and not (creator_sprints.audience->'creatorIds' ? ${creatorId ?? ''})))`
}
