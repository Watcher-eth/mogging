import {expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import {EngagementDashboard} from './engagement-dashboard'

function snapshot():AnalyticsDashboard{
 return {generatedAt:'2026-10-27T22:00:00Z',filters:{days:'30',platform:'all',section:'Engagement'},engagement:{
  summary:[{active_devices:6,engaged_devices:5,multi_day_devices:3}],daily:[],features:[{feature:'reports',devices:4,engaged_devices:4,events:20},{feature:'protocols',devices:3,engaged_devices:2,events:10}],
  actions:[{reports_reviewed:12,task_completions:9,lesson_completions:8,course_completions:2,sharing_devices:1,repeat_scan_devices:2}],courses:[{course_id:'capture',devices:3,engaged_devices:2,lessons_opened:5,lessons_completed:4,course_completers:1,timed_visits:6,median_ms:12000}],progress:[{devices:3,engaged_devices:2,detail_opens:4,protocol_openers:1,scan_openers:2,timed_visits:2,median_ms:15000}],coverage:[{latest_event:'2026-10-27T21:30:00',latest_receipt:'2026-10-27T21:31:00',unidentified_events:2,lessons_without_id:3}],events:[],
 }} as unknown as AnalyticsDashboard
}

test('engagement rate uses independently deduplicated product devices and feature reach remains overlapping',()=>{
 const html=renderToStaticMarkup(<EngagementDashboard data={snapshot()} days={30}/>)
 expect(html).toContain('>6</p>')
 expect(html).toContain('>5</p>')
 expect(html).toContain('>83.3%</p>')
 expect(html).toContain('60.0% of engaged devices')
 expect(html).toContain('Features overlap')
 expect(html).toContain('do not sum the rows into a customer total')
 expect(html).toContain('marketing-only web visits excluded')
 expect(html).toContain('multi-day use is not cohort retention')
})

test('action units, foreground duration samples and completion limits are explicit',()=>{
 const html=renderToStaticMarkup(<EngagementDashboard data={snapshot()} days={30}/>)
 expect(html).toContain('Distinct device–report–task–date combinations')
 expect(html).toContain('The repeatable scan')
 expect(html).toContain('12 s')
 expect(html).toContain('not verified learning')
 expect(html).toContain('not verified real-world adherence')
 expect(html).toContain('not confirmed recipient delivery')
 expect(html).toContain('Missing telemetry is not measured inactivity')
 expect(html).toContain('2:31 PM PDT')
 expect(html).toContain('60-second cache')
})

test('last-24-hour multi-day counts explain calendar boundaries instead of claiming retention',()=>{
 const html=renderToStaticMarkup(<EngagementDashboard data={snapshot()} days={1}/>)
 expect(html).toContain('two Pacific calendar dates within the last 24 hours')
 expect(html).toContain('Last-24-hour windows can span two dates')
})

test('missing snapshots, identities and visit samples never fabricate rates or duration',()=>{
 const data=snapshot()
 data.engagement!.summary=[{active_devices:0,engaged_devices:0,multi_day_devices:0}]
 data.engagement!.courses=[]
 data.engagement!.progress=[{devices:0,engaged_devices:0,timed_visits:0,median_ms:null}]
 const html=renderToStaticMarkup(<EngagementDashboard data={data} days={30}/>)
 expect(html).toContain('No identified product devices available')
 expect(html).not.toContain('>0.0%</p>')
 expect(html).not.toContain('>0 s</td>')
 expect(html).not.toContain('NaN')
 expect(html).toContain('No learning activity was recorded')
 data.engagement=null
 expect(renderToStaticMarkup(<EngagementDashboard data={data} days={30}/>)).toContain('Unavailable data is not shown as zero')
})
