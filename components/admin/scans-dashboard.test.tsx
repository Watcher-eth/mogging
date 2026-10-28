import {expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import {ScansDashboard} from './scans-dashboard'

function snapshot():AnalyticsDashboard {
  return {generatedAt:'2026-10-27T22:00:00Z',filters:{days:'30',platform:'all',section:'Scans'},scans:{
    summary:[{requests:120,accounts:40,completed:80,failed:20,pending:20,pending_over_five_minutes:3,oldest_pending:'2026-10-27T21:00:00',distinct_reports:50,latest_request:'2026-10-27T21:30:00'}],daily:[],sources:[{source:'referral_reward',requests:120,completed:80,failed:20,pending:20}],
    reports:[{completed:35,failed:4,other:0}],client:[{request_starts:170,request_completions:90,request_failures:40,timed_completions:70,median_ms:900,p90_ms:2100,timed_evaluations:60,evaluation_median_ms:900,evaluation_p90_ms:2100,latest_receipt:'2026-10-27T21:31:00'}],failures:[],events:[],releases:[],
  }} as unknown as AnalyticsDashboard
}

test('scan completion rate uses settled backend requests and excludes pending records',()=>{
  const html=renderToStaticMarkup(<ScansDashboard data={snapshot()} days={30}/> )
  expect(html).toContain('>80.0%</p>')
  expect(html).toContain('80 of 100 settled requests · pending excluded')
  expect(html).not.toContain('66.7%')
  expect(html).toContain('Pending for more than five minutes: 3')
  expect(html).toContain('Pending records do not establish that processing is still active')
  expect(html).not.toContain('Returned scans')
})

test('saved reports, distinct report references, client requests and backend evaluations remain independent',()=>{
  const html=renderToStaticMarkup(<ScansDashboard data={snapshot()} days={30}/>)
  for(const value of ['80','20','35','4','50'])expect(html).toContain(`>${value}</p>`)
  expect(html).toContain('can update or reuse an existing report')
  expect(html).toContain('>0.9 s</p>')
  expect(html).toContain('>2.1 s</p>')
  expect(html).toContain('60 successful evaluation events with valid duration')
  expect(html).toContain('not backend-only processing time')
  expect(html).toContain('not a matched evaluation funnel')
  expect(html).toContain('Referral reward credits')
  expect(html).toContain('does not infer cash refunds')
})

test('snapshot, request start and ingestion timestamps have clear all-platform scope',()=>{
  const html=renderToStaticMarkup(<ScansDashboard data={snapshot()} days={1}/>)
  expect(html).toContain('Last 24 hours')
  expect(html).toContain('All platforms')
  expect(html).toContain('2:31 PM PDT')
  expect(html).toContain('Reservation completion timestamps are not stored')
  expect(html).toContain('60-second cache')
})

test('missing timing and unsettled-only populations never imply a measured zero rate or latency',()=>{
  const data=snapshot()
  data.scans!.summary[0]={requests:2,completed:0,failed:0,pending:2}
  data.scans!.client[0]={timed_completions:0,median_ms:null,p90_ms:null,timed_evaluations:0,evaluation_median_ms:null,evaluation_p90_ms:null}
  const html=renderToStaticMarkup(<ScansDashboard data={data} days={30}/>)
  expect(html).toContain('No settled requests available')
  expect(html).not.toContain('>0.0%</p>')
  expect(html).not.toContain('>0 s</p>')
  expect(html).not.toContain('NaN')
  data.scans=null
  expect(renderToStaticMarkup(<ScansDashboard data={data} days={30}/>)).toContain('Unavailable data is not shown as zero')
})
