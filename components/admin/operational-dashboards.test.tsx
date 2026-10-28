import {expect,test} from 'bun:test'
import {renderToStaticMarkup} from 'react-dom/server'
import type {AnalyticsDashboard} from '@/lib/admin/analytics'
import type {ReliabilityData} from '@/lib/admin/reliability'
import {NotificationsDashboard} from './notifications-dashboard'
import {AttributionLedgerDashboard} from './attribution-ledger-dashboard'
import {DataHealthDashboard} from './data-health-dashboard'
import {ReliabilityDashboard} from './reliability-report'
const base={generatedAt:'2026-10-27T22:00:00Z'} as AnalyticsDashboard
const render=renderToStaticMarkup
test('unavailable reports withhold counters rather than manufacturing zero outcomes',()=>{
 for(const Component of [NotificationsDashboard,AttributionLedgerDashboard,DataHealthDashboard]){
  const html=render(<Component data={base} days={30}/>);expect(html).toContain('unavailable');expect(html).not.toContain('>0</p>')
 }
})
test('notification current state and period observations retain different scopes and retention disclosure',()=>{
 const data={...base,notifications:{summary:[{accounts:10,endpoints:12,current_sessions:7,records:25,record_accounts:9,opens:0,openers:0}],daily:[],registrations:[],kinds:[],coverage:[]}}
 const html=render(<NotificationsDashboard data={data} days={90}/>)
 expect(html).toContain('>10</p>');expect(html).toContain('>7</p>');expect(html).toContain('>25</p>')
 expect(html).toContain('pruned after 35 days');expect(html).toContain('does not prove device delivery');expect(html).toContain('cannot be measured here')
})
test('ledger uses selected credit model and currency rather than summing overlapping records',()=>{
 const data={...base,attributionLedger:{summary:[{credit:'direct',currency:'USD',payments:3,records:5,gross:100,reversals:20,net:80},{credit:'first',currency:'USD',payments:99,records:99,gross:9900,reversals:0,net:9900},{credit:'direct',currency:'EUR',payments:12,records:12,gross:500,reversals:0,net:500}],daily:[],records:[],coverage:[]}}
 const html=render(<AttributionLedgerDashboard data={data} days={30}/>)
 expect(html).toContain('$100.00');expect(html).toContain('$80.00');expect(html).not.toContain('$9,900.00');expect(html).not.toContain('€500')
 expect(html).toContain('latest 100 records');expect(html).toContain('must be reviewed separately')
})
test('empty ledger does not invent measured monetary totals',()=>{
 const html=render(<AttributionLedgerDashboard data={{...base,attributionLedger:{summary:[],daily:[],records:[],coverage:[]}}} days={1}/>)
 expect(html).not.toContain('$0.00');expect(html).toContain('>—</p>')
})
test('data health distinguishes ingestion delay, all-mode queue scope and local runtime settings',()=>{
 const html=render(<DataHealthDashboard data={{...base,dataHealth:{summary:[{client_records:12,billing_records:2,p90_ms:1500}],daily:[],sources:[],billing:[],backlog:[{unfinished_webhooks:3}],context:[],settings:{runtime:'development',exportEnabled:false,scheduler:false}}}} days={7}/>)
 expect(html).toContain('1.5');expect(html).toContain('production/test modes not separable');expect(html).toContain('not API response latency');expect(html).toContain('development')
})
function reliability(operations:number):ReliabilityData{return {runtime:'development',generatedAt:base.generatedAt,available:true,health:{database:true,configured:false,checked_at:base.generatedAt},alerts:{configured:false,deduplication:false},summary:{operations,operation_issues:operations?2:0,p95_ms:null},features:[],daily:[],failures:[],recent:[],clients:[],notifications:[],stalled:[],unresolved_count:67,alertSummary:[]} as unknown as ReliabilityData}
test('reliability uses full unresolved count and observed-operation denominator without asserting uptime',()=>{
 const html=render(<ReliabilityDashboard data={reliability(10)} days={1}/>)
 expect(html).toContain('20.0%');expect(html).toContain('>67</p>');expect(html).toContain('not an uptime');expect(html).toContain('local development')
 const empty=render(<ReliabilityDashboard data={reliability(0)} days={1}/>);expect(empty).not.toContain('>0.0%</p>')
 const unavailable=render(<ReliabilityDashboard data={{...reliability(10),available:false}} days={1}/>);expect(unavailable).not.toContain('>20.0%</p>')
})
