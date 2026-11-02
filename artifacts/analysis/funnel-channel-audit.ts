import postgres from 'postgres'
import {drizzle} from 'drizzle-orm/postgres-js'
import {sql} from 'drizzle-orm'
import {audienceCTEs,customerEvent,customerAccount} from '../../lib/admin/audience'
const client=postgres(process.env.DATABASE_URL!,{max:1,prepare:false}); const db=drizzle(client)
try {
const result=await db.execute(sql`with ${audienceCTEs()}, e as materialized (
select a.*,coalesce('install:'||mobile_install_id,'anon:'||anonymous_id,'account:'||account_id) actor from analytics_events a where ${customerEvent('a')} and occurred_at >= now() at time zone 'UTC'-interval '30 days'),
b as materialized(select * from subscription_events where environment='production' and ${customerAccount(sql`coalesce(account_id,external_user_id)`)} and occurred_at>=now() at time zone 'UTC'-interval '30 days')
select json_build_object('clock',now(), 'events',(select json_agg(t) from (select platform,event_name,source,properties->>'surface' surface,count(*) events,count(distinct actor) actors,count(distinct account_id) accounts,count(distinct session_id) sessions,min(occurred_at) first,max(occurred_at) latest from e where event_name in ('app_first_open','onboarding_started','paywall_viewed','plan_selected','purchase_started','purchase_completed','purchase_activated','purchase_cancelled','purchase_failed','checkout_started','checkout_completed','landing_viewed','app_store_redirected') group by 1,2,3,4 order by 1,2,3,4) t),
'billing',(select json_agg(t) from(select provider,event_name,product_id,currency,count(*) events,count(distinct coalesce(account_id,external_user_id)) accounts,sum(amount) amount,min(occurred_at) first,max(occurred_at) latest from b group by 1,2,3,4 order by 1,2,3) t),
'web_keys',(select json_agg(t) from (select event_name,key,count(*) n from e cross join lateral jsonb_object_keys(properties) key where platform='server' and event_name in ('checkout_started','checkout_completed') group by 1,2 order by 1,3 desc) t)) report`)
console.log(JSON.stringify(result[0].report,null,2))
}finally{await client.end()}
