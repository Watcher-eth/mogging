import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { formatReportingTime } from '@/lib/admin/reporting-time'
import { AnalyticsChart, chartColors, type ChartMetric } from './analytics-chart'
import { Bars, DataDetails, Notice, Panel, Stat, Table, count, label, percent } from './analytics-ui'

const metrics:ChartMetric[]=[{key:'engaged_devices',label:'Engaged devices',color:chartColors.green}]
const featureNames:Record<string,string>={reports:'Reports',protocols:'Protocols',courses:'Learning',progress:'Progress',sharing:'Sharing'}
const courseNames:Record<string,string>={capture:'The repeatable scan',skin:'The everyday skin routine',style:'Grooming, considered',unknown:'Course not recorded'}
const eventNames:Record<string,string>={report_viewed:'Report views',category_viewed:'Report category opens',repeat_evaluation_started:'Repeat scan starts',protocol_viewed:'Protocol views',protocol_task_completed:'Protocol task completions',course_viewed:'Course opens',course_lesson_viewed:'Lesson opens',course_lesson_exited:'Recorded lesson visit exits',course_lesson_completed:'Lesson completions',course_completed:'Course completions',progress_viewed:'Progress opens',progress_exited:'Recorded Progress visit exits',progress_area_viewed:'Progress detail opens',progress_action_selected:'Actions selected in Progress',share_started:'Share starts',share_completed:'Reported share completions',share_failed:'Reported share errors'}
const time=(value:unknown)=>typeof value==='string'?formatReportingTime(value,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}):'No observation available'
const duration=(value:unknown)=>value==null?'—':`${count(Number(value)/1000)} s`

export function EngagementDashboard({data,days}:{data:AnalyticsDashboard;days:number}){
  const report=data.engagement
  if(!report)return <Notice>Engagement data could not be established from this snapshot. Unavailable data is not shown as zero.</Notice>
  const summary=report.summary[0],actions=report.actions[0],progress=report.progress[0],coverage=report.coverage[0]
  const featureMaximum=Math.max(4,Math.ceil(Math.max(0,...report.features.map(row=>Number(row.devices)))/4)*4)
  return <>
    <p className="mb-5 text-xs leading-5 text-zinc-500">{days===1?'Last 24 hours':`Last ${days} days`} · {data.filters.platform==='all'?'All platforms':data.filters.platform==='ios'?'iOS':label(data.filters.platform)} · Production customer activity · Pacific time</p>
    <div className="admin-stats-grid">
      <Stat title="Active product devices" value={count(summary?.active_devices)} note="Observed mobile activity or web product use · marketing-only web visits excluded"/>
      <Stat title="Engaged devices" value={count(summary?.engaged_devices)} note="At least one qualifying product action in this period"/>
      <Stat title="Engagement rate" value={percent(Number(summary?.engaged_devices),Number(summary?.active_devices))} note={Number(summary?.active_devices)>0?'Engaged devices as a share of active product devices':'No identified product devices available to measure a rate'}/>
      <Stat title="Engaged on multiple days" value={count(summary?.multi_day_devices)} note={Number(summary?.engaged_devices)===0?'No engaged devices recorded in this period':days===1?'Engaged on two Pacific calendar dates within the last 24 hours':`${percent(Number(summary?.multi_day_devices),Number(summary?.engaged_devices))} of engaged devices · two or more Pacific dates`}/>
    </div>
    <p className="mb-5 text-sm leading-6 text-zinc-500">Engagement includes viewing a report or protocol, completing a tracked task, lesson, course or share, opening a Progress detail, or spending at least 10 seconds in a foreground lesson or Progress visit. Devices are not unique people or paying customers; multi-day use is not cohort retention.</p>
    <Panel title="Product engagement over time" description={`${days===1?'Hourly':'Daily'} engaged devices · each device counted once per bucket`}
      note="Active product devices include identified iOS/Android devices with any eligible customer event and web browsers with report, protocol, learning, Progress or sharing events. Website-only marketing visits are outside this denominator. Engaged devices are a subset using the qualifying actions listed above. Multi-day engagement deduplicates qualifying Pacific calendar dates within this window, not D1/D7 retention or a fixed follow-up cohort. Last-24-hour windows can span two dates. Daily totals cannot be added to reproduce period device totals. Empty or unidentified-only buckets are omitted; gaps do not establish zero usage. Boundary buckets are partial.">
      <AnalyticsChart key={`${days}:${data.filters.platform}`} title="Product engagement over time" rows={report.daily} metrics={metrics} days={days}/>
      <DataDetails><Table rows={report.daily.map(row=>({period:time(row.day),active_devices:row.active_devices,engaged_devices:row.engaged_devices,engagement_rate:percent(Number(row.engaged_devices),Number(row.active_devices))}))} columns={['period','active_devices','engaged_devices','engagement_rate']}/></DataDetails>
    </Panel>
    <Panel title="Feature reach" description="Distinct devices with recorded feature activity, including browsing. Features overlap."
      note="Reach includes browsing or interacting with a feature, while engaged-device counts apply the stricter engagement definition. Every feature reach percentage uses the same active-product-device denominator. A device can use several features; do not sum the rows into a customer total. Sharing reach includes opening or failing a share; engagement requires a reported completion. Recorded zero means no matching observation, not verified non-use on older clients.">
      <Bars animated maximum={featureMaximum} labelWidth={150} rows={report.features.map(row=>({label:featureNames[String(row.feature)]??label(String(row.feature)),value:Number(row.devices),detail:`${percent(Number(row.devices),Number(summary?.active_devices))} of active product devices · ${count(row.engaged_devices)} engaged devices`}))}/>
      <DataDetails><Table rows={report.features.map(row=>({feature:featureNames[String(row.feature)]??label(String(row.feature)),devices:row.devices,reach:percent(Number(row.devices),Number(summary?.active_devices)),engaged_devices:row.engaged_devices,events:row.events}))} columns={['feature','devices','reach','engaged_devices','events']}/></DataDetails>
    </Panel>
    <Panel title="Key product actions" description="Recorded actions with a clear unit of measurement. These rows are not additive."
      note="Report opens deduplicate device/report pairs with a recorded report ID and can include other people's reports; they do not establish reading time or paid delivery. Protocol completions deduplicate device/report/task/Pacific-date combinations with a task ID; they reflect client checkmarks, not verified real-world adherence. Lesson completions deduplicate device/course/lesson combinations, and course completions deduplicate device/course pairs with valid content IDs. Local progress resets or reinstalls can produce new observations. Sharing is a client completion signal, not confirmed recipient delivery. Repeat-scan starts measure intent, not completed scans. Records lacking required identifiers are excluded from deduplicated action counts and shown in coverage.">
      <Table rows={[
        {activity:'Reports opened',recorded:actions?.reports_reviewed??null,unit:'Distinct device–report pairs'},
        {activity:'Protocol tasks completed',recorded:actions?.task_completions??null,unit:'Distinct device–report–task–date combinations'},
        {activity:'Lessons completed',recorded:actions?.lesson_completions??null,unit:'Distinct device–course–lesson combinations'},
        {activity:'Courses completed',recorded:actions?.course_completions??null,unit:'Distinct device–course combinations'},
        {activity:'Devices completing a share',recorded:actions?.sharing_devices??null,unit:'Distinct devices with reported share completion'},
        {activity:'Devices starting a repeat scan',recorded:actions?.repeat_scan_devices??null,unit:'Distinct devices · scan completion not established'},
      ]} columns={['activity','recorded','unit']}/>
      <DataDetails><Table rows={report.events.map(row=>({activity:eventNames[String(row.event_name)]??label(String(row.event_name)),events:row.events,devices:row.devices}))} columns={['activity','events','devices']}/><p className="mt-3 text-xs leading-5 text-zinc-500">These supporting event counts include repeats and are independent observations, not a sequential conversion funnel.</p></DataDetails>
    </Panel>
    <Panel title="Learning and Progress" description="Content use, completed lessons and deliberate progress interactions."
      note="Learning reach includes course browsing. Engaged learning includes completed lessons/courses or a recorded lesson visit lasting at least 10 seconds. Lesson opens and completions are deduplicated independently by device/course/lesson and do not form a completion-rate denominator. Observed course completion is local app progress, not verified learning. Median foreground time uses valid exit events between zero and 30 minutes, including interrupted visits; force-closes without an exit leave duration unknown. A resumed visit is a new sample. Progress action selections indicate navigation, not completed tasks or scans. Self and other-profile activity can both be included; no person's identity is exposed.">
      <h3 className="mb-3 text-sm font-medium">Learning activity</h3>
      {report.courses.length?<Table rows={report.courses.map(row=>({...row,course:courseNames[String(row.course_id)]??label(String(row.course_id).replaceAll('-',' ')),median_foreground_visit:duration(row.median_ms)}))} columns={['course','devices','engaged_devices','lessons_opened','lessons_completed','course_completers','timed_visits','median_foreground_visit']}/>:<p className="admin-empty">No learning activity was recorded in this period. Older releases may not report these events.</p>}
      <h3 className="mb-3 mt-6 text-sm font-medium">Progress activity</h3>
      {Number(progress?.devices)>0?<Table rows={progress?[{devices:progress.devices,engaged_devices:progress.engaged_devices,detail_opens:progress.detail_opens,devices_opening_protocol:progress.protocol_openers,devices_opening_scans:progress.scan_openers,timed_visits:progress.timed_visits,median_foreground_visit:duration(progress.median_ms)}]:[]} columns={['devices','engaged_devices','detail_opens','devices_opening_protocol','devices_opening_scans','timed_visits','median_foreground_visit']}/>:<p className="admin-empty">No identified Progress activity was recorded in this period.</p>}
      <p className="mt-3 text-xs leading-5 text-zinc-500">No recorded visits or timing samples does not establish that a feature was unused. Detailed learning and Progress tracking requires a supported app release.</p>
    </Panel>
    <Panel title="Data sources and freshness" description="Snapshot time, product activity and ingestion timing.">
      <dl className="grid gap-5 text-sm sm:grid-cols-3">{[['Snapshot generated',data.generatedAt],['Latest product feature event',coverage?.latest_event],['Latest feature event received',coverage?.latest_receipt]].map(([title,value])=><div key={String(title)}><dt className="text-zinc-500">{title}</dt><dd className="mt-1 font-medium">{time(value)}</dd></div>)}</dl>
      <p className="mt-5 text-xs leading-5 text-zinc-500">Source: production customer client analytics for the selected platform and period. Known internal identities, explicit sandbox activity and retired Battle/Leaderboard surfaces are excluded. Legacy runtime-unknown activity remains included. Checks every minute while visible and on return to this tab; snapshots use a 60-second cache with background revalidation. Device counts depend on installation/browser identifiers and can change across reinstalls or identity changes. Source timestamps do not establish complete collection.</p>
      <DataDetails><Table rows={[
        {measurement:'Feature events without a device/browser identity',value:coverage?.unidentified_events??null},
        {measurement:'Report-view events without report identifiers',value:coverage?.reports_without_id??null},
        {measurement:'Task completions without task identifiers',value:coverage?.tasks_without_id??null},
        {measurement:'Lesson completions without content identifiers',value:coverage?.lessons_without_id??null},
        {measurement:'Course completions without course identifiers',value:coverage?.courses_without_id??null},
        {measurement:'Mobile feature events without confirmed runtime provenance',value:coverage?.runtime_unconfirmed_events??null},
      ]} columns={['measurement','value']}/><p className="mt-3 text-xs leading-5 text-zinc-500">Events without device identity are outside device metrics. Identifier gaps can make deduplicated action counts lower than event counts. Missing telemetry is not measured inactivity.</p></DataDetails>
    </Panel>
  </>
}
