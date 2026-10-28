import { expect, test } from 'bun:test'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { sql } from 'drizzle-orm'
import { campaignAccessSql } from './campaign-access-sql'
import { canSeeCampaign, type CampaignAudience } from './campaign-access'

const integration = process.env.RUN_CAMPAIGN_ACCESS_INTEGRATION === '1' ? test : test.skip
integration('database visibility matches policy for selected, excluded, unregistered and unrelated creators', async () => {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false, connect_timeout: 10 })
  try {
    await drizzle(client).transaction(async tx => {
      // A connection-local temporary table shadows the real table; no persistent data changes.
      await tx.execute(sql`create temporary table creator_sprints (id text, audience jsonb) on commit drop`)
      const audiences: CampaignAudience[] = [{ mode: 'all', creatorIds: [] }, { mode: 'selected', creatorIds: ['one', 'two'] }, { mode: 'except', creatorIds: ['one', 'two'] }, { mode: 'selected', creatorIds: [] }]
      for (const [index, audience] of audiences.entries()) await tx.execute(sql`insert into pg_temp.creator_sprints values (${String(index)}, ${JSON.stringify(audience)}::jsonb)`)
      for (const creatorId of ['one', 'two', 'unrelated', undefined, null]) {
        const rows = await tx.execute<{ id: string }>(sql`select id from pg_temp.creator_sprints as creator_sprints where ${campaignAccessSql(creatorId)} order by id`)
        expect(rows.map(row => row.id)).toEqual(audiences.flatMap((audience, index) => canSeeCampaign(audience, creatorId) ? [String(index)] : []))
      }
    })
  } finally { await client.end() }
})
