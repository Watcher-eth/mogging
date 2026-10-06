import { expect, test } from 'bun:test'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { analyticsQuery } from './analytics'

const url = process.env.TEST_ANALYTICS_DATABASE_URL

test.skipIf(!url)('homepage reporting deduplicates exposure and only credits matching, timely production outcomes', async () => {
  if (!url || !['127.0.0.1','localhost'].includes(new URL(url).hostname)) throw new Error('Use an isolated local test database')
  const client = postgres(url, { max: 1 })
  try {
    await client.begin(async tx => {
      await tx`create temporary table analytics_events (event_name text, occurred_at timestamp, received_at timestamp default now(), account_id text, anonymous_id text, mobile_install_id text, platform text, app_version text, properties jsonb, session_id text, source text, schema_version integer default 1, environment text) on commit drop`
      await tx`create temporary table subscription_events (id text, provider text, provider_event_id text, provider_type text, event_name text, account_id text, external_user_id text, subscription_id text, transaction_id text, amount numeric, currency text, product_id text, properties jsonb, environment text, occurred_at timestamp, received_at timestamp, exported_at timestamp) on commit drop`
      async function event(name: string, id: string, variant: string, at: string, extra: Record<string, unknown> = {}, platform = 'web', experiment = 'landing_homepage_v2', version = '2', environment = 'production') {
        const properties = {landing_id:id,variant,experiment_id:experiment,landing_version:version,path:'/',...extra}
        await tx`insert into analytics_events (event_name, occurred_at, anonymous_id, platform, properties, source, environment) values (${name},${at}::timestamp,${id},${platform},${tx.json(properties)},'mogging.com',${environment})`
      }
      await event('landing_viewed','old','a','2026-09-10')
      await event('landing_viewed','old','a','2026-09-11')
      await event('app_store_redirected','old','a','2026-09-11')
      await event('app_store_redirected','old','a','2026-09-12')
      await event('landing_viewed','new','b','2026-09-11')
      await event('app_store_redirected','new','b','2026-09-10') // before exposure
      await event('app_store_redirected','new','a','2026-09-12') // wrong variant
      await event('app_store_redirected','new','b','2026-09-20') // outside seven days
      await event('checkout_completed','new','b','2026-09-12',{status:'paid',price:9.99},'server')
      await event('checkout_completed','old','a','2026-09-12',{status:'paid',price:0},'server')
      await event('landing_viewed','legacy','a','2026-09-13',{},'web','landing_hero_v1','1')
      await event('app_store_redirected','legacy','a','2026-09-14',{},'web','landing_hero_v1','1')
      await event('landing_viewed','bad-version','a','2026-09-13',{},'web','landing_homepage_v2','1')
      await event('landing_viewed','development','a','2026-09-13',{},'web','landing_homepage_v2','2','development')
      const query = new PgDialect().sqlToQuery(analyticsQuery({days:'30',platform:'all'},new Date('2026-10-05T00:00:00Z')))
      const [result] = await tx.unsafe(query.sql,query.params as (string | number | null)[])
      const rows = result.data.landingExperiments
      expect(rows.find((row: {experiment_id:string;variant:string})=>row.experiment_id==='landing_homepage_v2'&&row.variant==='a')).toMatchObject({visitors:1,store_clicks:1,mature:1,mature_store_clicks:1,paid_checkouts:0})
      expect(rows.find((row: {experiment_id:string;variant:string})=>row.experiment_id==='landing_homepage_v2'&&row.variant==='b')).toMatchObject({visitors:1,store_clicks:0,mature:1,mature_store_clicks:0,paid_checkouts:1})
      expect(rows.find((row: {experiment_id:string;variant:string})=>row.experiment_id==='landing_hero_v1'&&row.variant==='a')).toMatchObject({visitors:1,store_clicks:1})
    })
  } finally { await client.end() }
})
