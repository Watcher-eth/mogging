import { useState } from 'react'
import type { AnalyticsDashboard, MetricRow } from '@/lib/admin/analytics'
import { trackingRows, type TrackingSection } from '@/lib/admin/tracking'
import { Panel, Table, DataDetails, label } from './analytics-ui'
import { AnalyticsSelect } from './analytics-select'

export function DimensionReport({ rows, title = 'Recorded context' }: { rows: MetricRow[]; title?: string }) {
  const [selected, setSelected] = useState('')
  const dimensions = [...new Set(rows.map(row => String(row.dimension)))].sort()
  const dimension = dimensions.includes(selected) ? selected : dimensions[0]
  return <Panel title={title} description="Compare recorded sources, choices, outcomes, and diagnostic codes." note="Top 20 observed values per dimension and section. Counts are event observations and distinct devices within each row; rows may overlap. Missing properties are not inferred. Identifiers, tokens, and raw provider payloads are not exposed.">
    {dimension ? <><div className="mb-5"><AnalyticsSelect label="Breakdown" value={dimension} onChange={setSelected} options={dimensions.map(value=>({value,label:label(value)}))} /></div><Table rows={rows.filter(row => row.dimension === dimension).map(row => ({ ...row, event: label(String(row.event)) }))} columns={['event','value','events','actors']} /></> : <p className="admin-empty">No context recorded in this window.</p>}
  </Panel>
}
export function EventReport({ data, section }: { data: AnalyticsDashboard; section: TrackingSection }) {
  const rows = trackingRows(data.eventMetrics ?? [], section)
  const events = new Set(rows.map(row => row.event))
  return <>
    <Panel title="Tracked milestones" description="Every supported milestone is shown, including those awaiting data." note="Event totals are not ordered conversion funnels. Devices can reach multiple milestones. Server events are included across every platform and have no device count; use the origin breakdown to distinguish server authority from client observations."><Table rows={rows.map(row => ({ ...row, event: label(String(row.event)) }))} columns={['event','status','events','actors','accounts']} /><DataDetails><Table rows={rows} columns={['event','sessions','attempts','flows','median_ms','p90_ms','latest_event']} /><Table rows={(data.eventPlatforms ?? []).filter(row => events.has(row.event))} columns={['event','platform','source','events','actors','accounts']} /></DataDetails></Panel>
    {['Acquisition','Onboarding','Scans','Engagement'].includes(section) ? <Panel title="Tracking context coverage" description="Recorded identifiers, counted without exposing raw values."><Table rows={(data.contextCoverage ?? []).filter(row => section === 'Acquisition' ? String(row.field).startsWith('creator_') || row.field === 'appsflyer_id' : section === 'Onboarding' ? row.field === 'flow_id' : section === 'Scans' ? ['attempt_id','evaluation_id'].includes(String(row.field)) : row.field === 'report_id')} columns={['field','events','actors','unique_ids']} /></Panel> : null}
    <DimensionReport rows={(data.dimensions ?? []).filter(row => row.section === section)} />
  </>
}
export function TrackingCoverage({ data }: { data: AnalyticsDashboard }) {
  const rows = trackingRows(data.eventMetrics ?? [])
  return <Panel title="Tracking coverage" description="All supported events, their reporting section, and the latest recorded observation." note="Awaiting data means no events observed for the selected window and platform. It does not prove a released app emits the event or that delivery is healthy. Server milestones always include all platforms."><Table rows={rows} columns={['section','event','status','events','actors','latest_event']} /></Panel>
}
