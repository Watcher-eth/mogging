import assert from 'node:assert/strict'
import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'

const address = process.env.ANALYTICS_TEST_DATABASE_URL
if (!address) throw new Error('Set a disposable localhost analytics_test database')
const url = new URL(address)
if (!['localhost','127.0.0.1'].includes(url.hostname) || url.pathname !== '/analytics_test') throw new Error('Refusing non-test database')
process.env.DATABASE_URL = address
const connection = postgres(address, { max: 1 })
try {
  const { analyticsQuery } = await import('../../lib/admin/analytics')
  await connection.begin(async tx => {
    // Temporary tables shadow public tables, so this suite never changes another fixture's schema/data.
    await tx.unsafe(`
      create temporary table users(id text primary key, analytics_internal boolean not null default false);
      create temporary table analytics_events(id text, event_id text, event_name text, account_id text, mobile_install_id text,
        anonymous_id text, session_id text, platform text, source text, properties jsonb, occurred_at timestamp,
        received_at timestamp default now(), schema_version int default 1, environment text, app_version text);
      create temporary table subscription_events(id text, provider text, provider_event_id text, provider_type text, properties jsonb,
        environment text, event_name text, account_id text, external_user_id text, transaction_id text, product_id text,
        subscription_id text, amount numeric, currency text, occurred_at timestamp, received_at timestamp default now());
      create temporary table payment_entitlements(id text, user_id text, mobile_install_id text, metadata jsonb, source text, stripe_checkout_session_id text);
      create temporary table scan_reservations(id text, entitlement_id text, user_id text, status text, result jsonb, created_at timestamp);
      create temporary table photos(id text, user_id text, source text);
      create temporary table analyses(id text, photo_id text, status text, created_at timestamp);
      create temporary table referral_signups(referred_user_id text, inviter_user_id text, created_at timestamptz);
    `)
    const dialect = new PgDialect()
    const query = async (platform: 'ios' | 'android' | 'web' | 'all' = 'ios') => {
      const compiled = dialect.sqlToQuery(analyticsQuery({days:'30',platform},new Date('2040-01-31T00:00:00Z')))
      const [result] = await tx.unsafe(compiled.sql,compiled.params as Parameters<typeof tx.unsafe>[1])
      return result.data as import('../../lib/admin/analytics').AnalyticsDashboard
    }
    await tx`insert into users(id,analytics_internal) values ('learner',false),('old',false),('recent',false),('internal',true),('glance',false)`
    const put = async (account: string | null, event: string, date: string, properties: Record<string,string | number | boolean | null> = {}, environment = 'production') => {
      await tx`insert into analytics_events(id,event_id,event_name,account_id,mobile_install_id,platform,environment,properties,occurred_at)
        values (${crypto.randomUUID()},${crypto.randomUUID()},${event},${account},${account ?? 'anonymous'},'ios',${environment},${tx.json(properties)},${date}::timestamp)`
    }
    const lesson = {course_id:'capture',lesson_id:'lighting'}
    await put('learner','evaluation_completed','2040-01-09')
    await put('learner','course_lesson_viewed','2040-01-10',lesson)
    await put('learner','course_lesson_completed','2040-01-10',lesson)
    await put('learner','course_lesson_completed','2040-01-10',lesson)
    await put('learner','course_lesson_exited','2040-01-11',{...lesson,duration_ms:12000})
    await put('learner','course_lesson_exited','2040-01-17',{...lesson,duration_ms:14000})
    await put('learner','progress_area_viewed','2040-01-20',{category:'overall'})
    await put('learner','progress_exited','2040-01-21',{duration_ms:13000})
    await put('learner','progress_action_selected','2040-01-21',{action:'protocol'})
    await put('old','course_lesson_completed','2039-12-01',lesson)
    await put('old','course_lesson_completed','2040-01-20',lesson)
    await put('recent','progress_exited','2040-01-30 12:00:00',{duration_ms:12000})
    await put('glance','progress_viewed','2040-01-10')
    await put('glance','progress_exited','2040-01-11',{duration_ms:4000})
    await put('glance','course_viewed','2040-01-10',{course_id:'capture'})
    await put(null,'progress_area_viewed','2040-01-10',{category:'overall'})
    await put('internal','course_completed','2040-01-10',lesson)
    await put('learner','course_completed','2040-01-10',lesson,'development')
    await put('learner','course_completed','2040-01-10',{...lesson,runtime_environment:'sandbox'})
    await put(null,'battle_vote_selected','2040-01-10')
    await put(null,'screen_viewed','2040-01-10',{screen:'Leaderboard'})
    await put(null,'page_viewed','2040-01-10',{path:'/battle'})
    await put('learner','progress_exited','2040-01-22',{duration_ms:'malformed'})
    const start = performance.now()
    const data = await query()
    const courses = data.featureUsage!.find(row=>row.feature==='courses')!
    assert.equal(Number(courses.lessons_completed),2,'distinct device–lesson completions')
    assert.equal(Number(courses.courses_completed),0,'sandbox and internal completions excluded')
    assert.equal(Number(courses.median_ms),13000,'valid foreground duration only')
    const retention=(feature:string,day:number)=>data.featureRetention!.find(row=>row.feature===feature&&Number(row.day)===day)!
    assert.equal(Number(retention('courses',1).eligible),1,'old history and mere views are not new cohorts')
    assert.equal(Number(retention('courses',1).retained),1)
    assert.equal(Number(retention('courses',7).retained),1)
    assert.equal(Number(retention('progress',1).eligible),1,'immature and anonymous accounts excluded')
    assert.equal(Number(retention('progress',1).retained),1)
    assert.equal(Number(retention('progress',30).eligible),0)
    assert.equal(Number(data.retention.find(row=>Number(row.day)===1)?.retained),1,'learning counts as meaningful post-scan return')
    assert.equal(Number(data.featureUsage!.find(row=>row.feature==='progress')?.protocol_opens),1)
    assert.ok(!data.screens.some(row=>/battle|leaderboard/i.test(String(row.screen))))
    assert.ok(!data.eventMetrics.some(row=>String(row.event).startsWith('battle_')))
    const empty=await query('android')
    assert.equal(empty.featureUsage!.length,0)
    assert.ok(empty.featureRetention!.every(row=>Number(row.eligible)===0))
    // Repeated events and events without a device still count as observations,
    // while distinct-device counts exclude missing actors. Empty IDs are not missing fields.
    const coverage = { report_id:'coverage-report', appsflyer_id:'af-one', creator_click_id:'', category:'coverage-category' }
    await put('learner','report_viewed','2040-01-12',coverage)
    await put('learner','report_viewed','2040-01-13',coverage)
    await tx`insert into analytics_events(id,event_id,event_name,platform,environment,properties,occurred_at)
      values (${crypto.randomUUID()},${crypto.randomUUID()},'report_viewed','ios','production',${tx.json(coverage)},'2040-01-14')`
    const covered = await query()
    const field = (name:string) => covered.contextCoverage.find(row=>row.field===name)!
    assert.equal(Number(field('appsflyer_id').events),3)
    assert.equal(Number(field('appsflyer_id').actors),1)
    assert.equal(Number(field('appsflyer_id').unique_ids),1)
    assert.equal(Number(field('creator_click_id').events),0)
    assert.equal(Number(field('creator_click_id').actors),0)
    assert.equal(Number(field('creator_click_id').unique_ids),1)
    assert.equal(Number(field('evaluation_id').unique_ids),0)
    const dimension = covered.dimensions.find(row=>row.event==='report_viewed'&&row.dimension==='category'&&row.value==='coverage-category')!
    assert.equal(Number(dimension.events),3)
    assert.equal(Number(dimension.actors),1)
    assert.ok(performance.now()-start<8000,'query remains within dashboard deadline')
    console.log('PASS: feature usage, completion deduplication, foreground durations, D1/D7/D30 maturity, earlier history, meaningful post-scan return, anonymous/internal/sandbox exclusion, retired surfaces, platform filtering')
    throw new Error('ROLLBACK_FIXTURES')
  }).catch(error=>{if(error.message!=='ROLLBACK_FIXTURES')throw error})
} finally {
  await connection.end()
  const client=(globalThis as typeof globalThis & {postgresClient?:postgres.Sql}).postgresClient
  if(client)await client.end()
}
