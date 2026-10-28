import {expect,test} from 'bun:test'
import {PgDialect} from 'drizzle-orm/pg-core'
import {analyticsFilters,analyticsQuery} from './analytics'
import {reliabilityQuery,unfinishedEvaluationsQuery} from './reliability'
const dialect=new PgDialect(),now=new Date('2026-10-27T22:00:00Z')
function query(section:'Notifications'|'AttributionLedger'|'Quality',days:'1'|'30'='30'){return dialect.sqlToQuery(analyticsQuery({section,days,platform:'ios'},now))}
test('operational snapshots select only their reports and normalize unreliable platform dimensions',()=>{
 for(const [section,cte] of [['Notifications','notifications'],['AttributionLedger','attribution_ledger'],['Quality','data_health']] as const){
  const q=query(section),selected=q.sql.split(') select json_build_object(').at(-1)!
  expect(selected).toContain(`(select report from ${cte})`)
  expect(selected).not.toContain('from "daily"')
  expect(selected).not.toContain('from "event_metrics"')
  expect(q.params).not.toContain('ios')
 }
 expect(analyticsFilters.safeParse({section:'Reliability'}).success).toBe(true)
})
test('notification account sessions use the latest registration and claims are scoped by creation time',()=>{
 const q=query('Notifications').sql
 expect(q).toContain('distinct on(user_id)')
 expect(q).toContain('order by user_id,updated_at desc,install_id desc')
 expect(q).toContain('from notification_latest where session_expires_at>')
 expect(q).toContain("where event_name='push_opened'")
 const serialized=q.split('notifications as (select json_build_object(')[1].split('as report)')[0]
 for(const secret of ['token','user_id','install_id'])expect(serialized).not.toContain(`'${secret}'`)
})
test('credit totals are uncapped, currencies and models remain separate, and audit lists are bounded',()=>{
 const q=query('AttributionLedger').sql
 expect(q).toContain('from creator_credits group by 1,2')
 expect(q).toContain('partition by credit,upper(currency)')
 expect(q).toContain('where rank<=100')
 expect(q).toContain('coalesce(s.occurred_at,e.created_at)')
 expect(q).toContain("s.environment = 'production'")
 expect(q).toContain('from creator_events) as underlying_records')
 expect(q).toContain('row_number() over(')
})
test('data health measures receipt windows, excludes negative lag from percentiles, and retains all-mode webhook scope',()=>{
 const q=query('Quality','1').sql
 expect(q).toContain('case when received_at>=occurred_at then')
 expect(q).toContain("platform in ('web','ios','android') and received_at>=")
 expect(q).toContain("date_trunc('hour', received_at)")
 expect(q).toContain("processed_at is null and received_at<")
 expect(q).toContain("interval '10 minutes'")
 expect(q).toContain("'context',coalesce((select json_agg(r) from health_context r),'[]'::json)")
})
test('reliability separates operational issues from signals and counts the full deduplicated unresolved set',()=>{
 const q=dialect.sqlToQuery(reliabilityQuery(1,now)).sql
 expect(q).toContain("where not signal and outcome in ('failed','degraded') and code is distinct from 'input_no_face'")
 expect(q).toContain("not in ('undefined','null')")
 expect(q).toContain("group by s.properties->>'trace_id'")
 expect(q).toContain("'unresolved_count',(select count(*) from unresolved)")
 expect(q).toContain('select * from unresolved order by started_at desc limit 50')
 expect(q).toContain("'alertSummary',coalesce((select json_agg(r) from \"alert_summary\"")
 expect(dialect.sqlToQuery(unfinishedEvaluationsQuery(now)).sql).not.toContain('as signal')
})
