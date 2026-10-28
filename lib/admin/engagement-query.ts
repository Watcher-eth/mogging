import { sql } from 'drizzle-orm'
import { reportingBucket } from './reporting-bucket'
import type { MetricRow } from './analytics'

export type EngagementReport = {
  summary: MetricRow[]; daily: MetricRow[]; features: MetricRow[]; actions: MetricRow[];
  courses: MetricRow[]; progress: MetricRow[]; coverage: MetricRow[]; events: MetricRow[]
}

export function engagementCTEs(days: number) {
  return sql`engagement_scope as materialized (
    select e.*,case
      when event_name in ('report_viewed','category_viewed','repeat_evaluation_started') then 'reports'
      when event_name in ('protocol_viewed','protocol_task_completed') then 'protocols'
      when event_name in ('course_viewed','course_lesson_viewed','course_lesson_exited','course_lesson_completed','course_completed') then 'courses'
      when event_name in ('progress_viewed','progress_exited','progress_area_viewed','progress_action_selected') then 'progress'
      when event_name in ('share_started','share_completed','share_failed') then 'sharing' end as feature,
      case when jsonb_typeof(properties->'duration_ms')='number' then
        case when (properties->>'duration_ms')::numeric between 0 and 1800000 then (properties->>'duration_ms')::numeric end end as duration_ms
    from e where platform in ('ios','android') or event_name in (
      'report_viewed','category_viewed','repeat_evaluation_started','protocol_viewed','protocol_task_completed',
      'course_viewed','course_lesson_viewed','course_lesson_exited','course_lesson_completed','course_completed',
      'progress_viewed','progress_exited','progress_area_viewed','progress_action_selected','share_started','share_completed','share_failed')
  ), engagement_activity as materialized (
    select *,event_name in ('report_viewed','protocol_viewed','protocol_task_completed','course_lesson_completed','course_completed','progress_area_viewed','share_completed')
      or (event_name in ('course_lesson_exited','progress_exited') and coalesce(duration_ms >= 10000,false)) as meaningful
    from engagement_scope
  ), engagement_devices as (
    select actor,count(distinct ${reportingBucket(sql`occurred_at`,30)}) filter(where meaningful) as engaged_days
    from engagement_activity where actor is not null group by actor
  ), engagement_summary as (
    select count(*) as active_devices,count(*) filter(where engaged_days>0) as engaged_devices,
      count(*) filter(where engaged_days>=2) as multi_day_devices
    from engagement_devices
  ), engagement_daily as (
    select ${reportingBucket(sql`occurred_at`,days)} as day,count(distinct actor) as active_devices,
      count(distinct actor) filter(where meaningful) as engaged_devices
    from engagement_activity group by 1 having count(distinct actor)>0 order by 1
  ), engagement_features as (
    select f.feature,count(distinct a.actor) as devices,count(distinct a.actor) filter(where meaningful) as engaged_devices,
      count(a.event_name) as events
    from (values ('reports'),('protocols'),('courses'),('progress'),('sharing')) f(feature)
    left join engagement_activity a on a.feature=f.feature group by f.feature order by count(distinct a.actor) desc,f.feature
  ), engagement_actions as (
    select count(distinct (actor,properties->>'report_id')) filter(where event_name='report_viewed' and nullif(properties->>'report_id','') is not null) as reports_reviewed,
      count(distinct (actor,nullif(properties->>'report_id',''),properties->>'task_id',${reportingBucket(sql`occurred_at`,30)}))
        filter(where event_name='protocol_task_completed' and nullif(properties->>'task_id','') is not null) as task_completions,
      count(distinct (actor,properties->>'course_id',properties->>'lesson_id')) filter(where event_name='course_lesson_completed'
        and nullif(properties->>'course_id','') is not null and nullif(properties->>'lesson_id','') is not null) as lesson_completions,
      count(distinct (actor,properties->>'course_id')) filter(where event_name='course_completed' and nullif(properties->>'course_id','') is not null) as course_completions,
      count(distinct actor) filter(where event_name='share_completed') as sharing_devices,
      count(distinct actor) filter(where event_name='repeat_evaluation_started') as repeat_scan_devices
    from engagement_activity where actor is not null
  ), engagement_courses as (
    select coalesce(nullif(properties->>'course_id',''),'unknown') as course_id,count(distinct actor) as devices,
      count(distinct actor) filter(where meaningful) as engaged_devices,
      count(distinct (actor,properties->>'course_id',properties->>'lesson_id')) filter(where event_name='course_lesson_viewed' and nullif(properties->>'course_id','') is not null and nullif(properties->>'lesson_id','') is not null) as lessons_opened,
      count(distinct (actor,properties->>'course_id',properties->>'lesson_id')) filter(where event_name='course_lesson_completed' and nullif(properties->>'course_id','') is not null and nullif(properties->>'lesson_id','') is not null) as lessons_completed,
      count(distinct actor) filter(where event_name='course_completed' and nullif(properties->>'course_id','') is not null) as course_completers,
      count(duration_ms) filter(where event_name='course_lesson_exited') as timed_visits,
      round((percentile_cont(0.5) within group(order by duration_ms) filter(where event_name='course_lesson_exited'))::numeric) as median_ms
    from engagement_activity where feature='courses' and actor is not null group by 1 order by count(distinct actor) desc,1
  ), engagement_progress as (
    select count(distinct actor) as devices,count(distinct actor) filter(where meaningful) as engaged_devices,
      count(*) filter(where event_name='progress_area_viewed') as detail_opens,
      count(distinct actor) filter(where event_name='progress_action_selected' and properties->>'action'='protocol') as protocol_openers,
      count(distinct actor) filter(where event_name='progress_action_selected' and properties->>'action'='evaluations') as scan_openers,
      count(duration_ms) filter(where event_name='progress_exited') as timed_visits,
      round((percentile_cont(0.5) within group(order by duration_ms) filter(where event_name='progress_exited'))::numeric) as median_ms
    from engagement_activity where feature='progress' and actor is not null
  ), engagement_events as (
    select event_name,count(*) as events,count(distinct actor) as devices from engagement_activity
    where feature is not null group by event_name order by event_name
  ), engagement_coverage as (
    select count(*) filter(where feature is not null) as feature_events,
      count(*) filter(where feature is not null and actor is null) as unidentified_events,
      count(*) filter(where event_name='report_viewed' and nullif(properties->>'report_id','') is null) as reports_without_id,
      count(*) filter(where event_name='protocol_task_completed' and nullif(properties->>'task_id','') is null) as tasks_without_id,
      count(*) filter(where event_name='course_lesson_completed' and (nullif(properties->>'course_id','') is null or nullif(properties->>'lesson_id','') is null)) as lessons_without_id,
      count(*) filter(where event_name='course_completed' and nullif(properties->>'course_id','') is null) as courses_without_id,
      count(*) filter(where feature is not null and platform in ('ios','android') and coalesce(properties->>'runtime_environment','unknown')='unknown') as runtime_unconfirmed_events,
      max(occurred_at) filter(where feature is not null) as latest_event,max(received_at) filter(where feature is not null) as latest_receipt
    from engagement_activity
  ), engagement as (
    select json_build_object(
      'summary',(select json_agg(r) from engagement_summary r),
      'daily',coalesce((select json_agg(r) from engagement_daily r),'[]'::json),
      'features',(select json_agg(r) from engagement_features r),
      'actions',(select json_agg(r) from engagement_actions r),
      'courses',coalesce((select json_agg(r) from engagement_courses r),'[]'::json),
      'progress',(select json_agg(r) from engagement_progress r),
      'coverage',(select json_agg(r) from engagement_coverage r),
      'events',coalesce((select json_agg(r) from engagement_events r),'[]'::json)
    ) as report
  )`
}
