import postgres from 'postgres'
import { PgDialect } from 'drizzle-orm/pg-core'
import { distributionMeasurementQuery } from '../../lib/admin/distribution-measurement'
import { syncCreatorVideoMetrics } from '../../lib/creator/video-metrics-sync'

if (process.env.CREATOR_METRICS_FIXTURE !== '1' || !process.env.DATABASE_URL?.startsWith('postgres://watcher@127.0.0.1:55438/mogging_video_metrics_fixture')) throw Error('Local fixture only')
const client = postgres(process.env.DATABASE_URL, { max: 1, connection: { TimeZone: 'UTC' } })
function assert(condition: unknown, message: string) { if (!condition) throw Error(message) }
await client.unsafe(`
drop schema public cascade; create schema public;
create table users(id text primary key,analytics_internal boolean default false);
create table creator_profiles(id text primary key,user_id text,display_name text,auth_status text default 'active');
create table creator_social_accounts(id text primary key,platform text,creator_profile_id text,connection_method text,provider_account_id text);
create table accounts(user_id text,type text,provider text,provider_account_id text,refresh_token text,access_token text,expires_at integer,token_type text,scope text,id_token text,session_state text,primary key(provider,provider_account_id));
create table creator_submissions(id text primary key,post_key text,platform text,creator_profile_id text,social_account_id text,is_draft boolean default false,admin_view_count_threshold integer,view_count_threshold integer,created_at timestamp default now(),updated_at timestamp default now(),posted_at timestamp);
create table creator_submission_analytics(submission_id text,storage_key text,assessed_at timestamp,data jsonb);
create table creator_tracking_links(id text,social_account_id text);
create table creator_attribution_clicks(id text,tracking_link_id text,is_bot boolean default false,created_at timestamp,submission_id text);
create table subscription_events(id text,provider text,environment text,occurred_at timestamp,event_name text,account_id text,amount numeric);
create table creator_attribution_events(id text,event_type text,amount_cents integer,user_id text,currency text,metadata jsonb,tracking_link_id text);
create table scan_reservations(user_id text,status text,created_at timestamp);
create table analytics_events(environment text,platform text,occurred_at timestamp,event_name text,account_id text,anonymous_id text,properties jsonb);
`)
await client.unsafe(await Bun.file('drizzle/0072_creator_video_observations.sql').text())
await client.unsafe(`
insert into users values('creator',false),('buyer',false);
insert into creator_profiles(id,user_id,display_name) values('profile','creator','Fixture Creator');
insert into creator_social_accounts values('social','tiktok','profile','oauth','openid'),('manual','tiktok','profile','manual',null),('basic','tiktok','profile','oauth','basic-openid');
insert into accounts(user_id,type,provider,provider_account_id,access_token,expires_at,scope) values
 ('creator','oauth','tiktok-creator','openid','test',2147483647,'user.info.basic video.list'),
 ('creator','oauth','tiktok-creator','basic-openid','test',2147483647,'user.info.basic');
insert into creator_submissions(id,post_key,platform,creator_profile_id,social_account_id,view_count_threshold)
 select 'post-'||i,'tiktok:'||i,'tiktok','profile','social',1000 from generate_series(100,124) i;
insert into creator_submissions(id,post_key,platform,creator_profile_id,social_account_id,view_count_threshold) values('manual-post','tiktok:199','tiktok','profile','manual',500),('basic-post','tiktok:200','tiktok','profile','basic',800);
insert into creator_submission_analytics values('manual-post','valid',now(),'{"storageKey":"valid","metricsVerified":{"totalViews":true,"totalViewsExact":true},"metrics":{"totalViews":777,"totalViewsExact":true}}'),
 ('basic-post','valid',now(),'{"storageKey":"wrong","metricsVerified":{"totalViews":true,"totalViewsExact":true},"metrics":{"totalViews":"broken","totalViewsExact":true}}');
`)
const requested: string[][] = []
const originalFetch = globalThis.fetch
globalThis.fetch = (async (_url: unknown, init: any) => {
  const ids = JSON.parse(init.body).filters.video_ids
  requested.push(ids)
  // A private/deleted video is absent. Counts are not replaced with zero.
  return Response.json({ error: { code: 'ok' }, data: { videos: ids.filter((id: string) => id !== '100').map((id: string) => ({ id, create_time: 1700000000, view_count: 2000 })) } })
}) as typeof fetch
const first = await syncCreatorVideoMetrics()
assert(first.accounts === 3 && first.observations === 19, 'Permission-gated first batch')
const [states] = await client`select json_object_agg(account_id,status) as data from creator_video_sync_state`
assert(states.data.manual === 'connection_required' && states.data.basic === 'video_scope_required', 'Blocked accounts classified')
await client`update creator_video_sync_state set next_attempt_at=now()-interval '1 minute' where account_id='social'`
await syncCreatorVideoMetrics()
assert(requested.length === 2 && requested[1].length === 5 && requested[1].includes('124'), 'Missing video must not starve later posts')
await client`update creator_video_sync_state set next_attempt_at=now()-interval '1 minute' where account_id='social'`
await syncCreatorVideoMetrics()
const [observations] = await client`select count(*)::int as total from creator_video_observations where source='tiktok_api'`
assert(observations.total === 24, 'Retry must not duplicate hourly observations')
const [recordings] = await client`select count(*)::int as total from creator_video_observations where source='verified_recording'`
assert(recordings.total === 1, 'Unverified/mismatched recordings must not be imported')
await client.unsafe(`
insert into creator_video_observations(post_key,source,observed_at,submission_id,measured_at,views) values('tiktok:101','tiktok_api',now()-interval '15 days','post-101',now()-interval '15 days',1200);
insert into creator_tracking_links values('link','social');
insert into creator_attribution_clicks values('click','link',false,now()-interval '1 day',null),('bot','link',true,now(),null);
insert into subscription_events values('payment','stripe','production',now()-interval '1 day','invoice_paid','buyer',9.99);
insert into creator_attribution_events values('allocated','payment',999,'buyer','USD','{"billingEventId":"payment"}','link');
insert into scan_reservations values('buyer','complete',now());
`)
const q = new PgDialect().sqlToQuery(distributionMeasurementQuery(14, new Date()))
const [report] = await client.unsafe(q.sql, q.params as any[])
const creator = report.data.creators[0]
assert(Number(creator.measured_views_gained) === 800 && creator.posts_with_period_baseline === 1, 'Growth needs same-source opening baseline')
assert(creator.link_clicks === 1 && creator.post_linked_clicks === 0, 'Bio links and bots must not fabricate per-post conversion')
assert(creator.attributed_paying_accounts === 1 && creator.purchasers_with_completed_evaluation === 1, 'Provider payment to server activation join')
assert(Number(report.data.billing[0].gross_cents) === 999, 'Verified money remains in provider currency')
console.log(JSON.stringify({ passed: true, checks: ['scope gating','rotating all posts','missing-video handling','idempotent retry','verified recording provenance','same-source growth','bio vs post attribution','payment-to-evaluation activation'], fixture: { accounts: first.accounts, apiObservations: observations.total } }))
globalThis.fetch = originalFetch
await client.end()
process.exit(0)
