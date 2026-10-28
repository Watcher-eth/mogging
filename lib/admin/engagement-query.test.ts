import {expect,test} from 'bun:test'
import {PgDialect} from 'drizzle-orm/pg-core'
import {analyticsQuery} from './analytics'
const dialect=new PgDialect(),now=new Date('2026-10-27T22:00:00Z')

test('engagement selects uncapped aggregates and preserves platform/customer scope without web marketing in its denominator',()=>{
 const query=dialect.sqlToQuery(analyticsQuery({days:'30',platform:'ios',section:'Engagement'},now))
 const selected=query.sql.split(') select json_build_object(').at(-1)!
 expect(selected).toContain('(select report from engagement)')
 for(const redundant of ['from "daily"','from "feature_usage"','from "event_metrics"','from "feature_retention"'])expect(selected).not.toContain(redundant)
 const report=query.sql.split('engagement_scope as materialized (')[1].split('), "onboarding_events0"')[0]
 expect(report).not.toMatch(/limit\s+\d/i)
 expect(report).toContain("from e where platform in ('ios','android') or event_name in")
 expect(query.params).toContain('ios')
 expect(query.params).toContain('2026-09-27T22:00:00.000Z')
 expect(report).toContain('from engagement_activity where actor is not null group by actor')
 expect(report).toContain('count(*) filter(where engaged_days>=2)')
 expect(query.params).toContain('America/Los_Angeles')
})

test('meaningful engagement requires deliberate actions or valid foreground duration and pairs content IDs when deduplicating',()=>{
 const query=dialect.sqlToQuery(analyticsQuery({days:'1',platform:'all',section:'Engagement'},now)).sql
 expect(query).toContain("jsonb_typeof(properties->'duration_ms')='number'")
 expect(query).toContain('between 0 and 1800000')
 expect(query).toContain('coalesce(duration_ms >= 10000,false)')
 expect(query).toContain("event_name in ('course_lesson_exited','progress_exited')")
 expect(query).toContain("count(distinct (actor,properties->>'course_id',properties->>'lesson_id'))")
 expect(query).toContain("nullif(properties->>'course_id','') is not null and nullif(properties->>'lesson_id','') is not null")
 expect(query).toContain("(actor,nullif(properties->>'report_id',''),properties->>'task_id',")
 expect(query).toContain("date_trunc('hour', occurred_at)")
 expect(query).toContain("count(duration_ms) filter(where event_name='progress_exited')")
 const serialized=query.split('), engagement as (')[1].split('), "onboarding_events0"')[0]
 for(const field of ['actor','account_id','report_id','task_id','session_id'])expect(serialized).not.toContain(`'${field}'`)
})
