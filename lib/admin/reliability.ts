import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { MetricRow } from './analytics'
import { backendHealth } from '@/lib/reliability/health'
import { reliabilityAlertStatus } from '@/lib/reliability/alerts'

export type ReliabilityData = {
  generatedAt:string
  health: Awaited<ReturnType<typeof backendHealth>>
  alerts:ReturnType<typeof reliabilityAlertStatus>
  available:boolean
  summary:MetricRow
  features:MetricRow[]
  daily:MetricRow[]
  failures:MetricRow[]
  recent:MetricRow[]
  clients:MetricRow[]
  notifications:MetricRow[]
  stalled:MetricRow[]
}
export function unfinishedEvaluationsQuery(now:Date) {
  const end=now.toISOString()
  return sql`select s.properties->>'trace_id' as trace,s.occurred_at as started_at from analytics_events s
    where s.event_name='backend_evaluation_started' and s.environment='production' and s.source='backend' and s.occurred_at>=${end}::timestamp-interval '24 hours' and s.occurred_at<${end}::timestamp-interval '5 minutes'
    and not exists(select 1 from analytics_events r where r.event_name='backend_request' and r.environment='production' and r.source='backend' and r.occurred_at>=s.occurred_at and r.properties->>'trace_id'=s.properties->>'trace_id') order by s.occurred_at desc limit 50`
}
export function reliabilityQuery(days:number,now:Date) {
  const start=new Date(now.getTime()-days*86400_000).toISOString()
  const end=now.toISOString()
  const bucket=days===1?'YYYY-MM-DD"T"HH24:00:00"Z"':'YYYY-MM-DD'
  const rows=(name:string)=>sql`coalesce((select json_agg(r) from ${sql.identifier(name)} r),'[]'::json)`
  return sql`with events as materialized (
    select occurred_at,properties from analytics_events where event_name='backend_request' and environment='production' and platform='server' and source='backend' and occurred_at>=${start}::timestamp and occurred_at<${end}::timestamp
  ), requests as (
    select occurred_at,properties->>'feature' as feature,properties->>'outcome' as outcome,properties->>'code' as code,properties->>'trace_id' as trace,
    case when properties->>'duration_ms' ~ '^[0-9]{1,9}$' then (properties->>'duration_ms')::numeric end as duration_ms from events
  ), summary as (
    select count(*) as requests,count(*) filter(where outcome='failed') as failures,count(*) filter(where outcome='degraded') as degraded,
    count(*) filter(where outcome='rejected') as rejected,count(*) filter(where outcome='failed' and code is distinct from 'input_no_face') as technical_failures,
    count(*) filter(where occurred_at>=${end}::timestamp-interval '15 minutes' and outcome in ('failed','degraded') and code is distinct from 'input_no_face') as recent_failures,
    max(occurred_at) as latest_event from requests
  ), features as (
    select feature,count(*) as requests,count(*) filter(where outcome='failed' and code is distinct from 'input_no_face') as technical_failures,
    count(*) filter(where outcome='degraded') as degraded,count(*) filter(where outcome='rejected') as rejected,
    count(*) filter(where code='input_no_face') as invalid_photos,
    percentile_cont(0.5) within group(order by duration_ms) as median_ms,percentile_cont(0.95) within group(order by duration_ms) as p95_ms,max(occurred_at) as latest_event from requests group by feature order by technical_failures desc,requests desc limit 100
  ), daily as (
    select to_char(occurred_at,${bucket}::text) as day,count(*) as requests,count(*) filter(where outcome in ('failed','degraded') and code is distinct from 'input_no_face') as failures,
    count(*) filter(where feature='analyze' and outcome in ('failed','degraded') and code is distinct from 'input_no_face') as evaluation_failures from requests group by 1 order by 1
  ), failures as (
    select feature,code,outcome,count(*) as events,max(occurred_at) as latest_event from requests where outcome in ('failed','degraded') group by 1,2,3 order by events desc limit 100
  ), recent as (
    select feature,code,outcome,duration_ms,trace,occurred_at as latest_event from requests where outcome in ('failed','degraded') order by occurred_at desc limit 50
  ), clients as (
    select event_name as event,platform,app_version as release,coalesce(properties->>'reason_code','unspecified') as code,count(*) as events,max(occurred_at) as latest_event from analytics_events where environment='production' and platform in ('web','ios','android') and event_name in ('evaluation_failed','photo_validation_failed','purchase_failed','restore_failed','account_auth_failed','account_post_login_failed','share_failed') and occurred_at>=${start}::timestamp and occurred_at<${end}::timestamp group by 1,2,3,4 order by events desc limit 100
  ), notifications as (
    select properties->>'feature' as feature,properties->>'code' as code,properties->>'status' as status,count(*) as events,max(occurred_at) as latest_event from analytics_events where event_name='backend_alert' and environment='production' and source='backend' and occurred_at>=${start}::timestamp and occurred_at<${end}::timestamp group by 1,2,3 order by latest_event desc limit 50
  ), stalled as (${unfinishedEvaluationsQuery(now)}) select json_build_object('summary',(select row_to_json(s) from summary s),'features',${rows('features')},'daily',${rows('daily')},'failures',${rows('failures')},'recent',${rows('recent')},'clients',${rows('clients')},'notifications',${rows('notifications')},'stalled',${rows('stalled')}) as data`
}
export async function getReliabilityData(days:number):Promise<ReliabilityData> {
  const [health,report] = await Promise.all([
    backendHealth(),
    db.transaction(async tx=>{
      await tx.execute(sql`set transaction read only`)
      await tx.execute(sql`set local statement_timeout = '8s'`)
      const [row]=await tx.execute(reliabilityQuery(days,new Date()))
      return row.data as Omit<ReliabilityData,'health'|'alerts'|'generatedAt'|'available'>
    }).catch(()=>null),
  ])
  return {generatedAt:new Date().toISOString(),health,alerts:reliabilityAlertStatus(),available:Boolean(report),
    ...(report || {summary:{},features:[],daily:[],failures:[],recent:[],clients:[],notifications:[],stalled:[]})}
}
