import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { PurchaseFlowDashboard } from './purchase-flow-dashboard'

function snapshot(): AnalyticsDashboard {
  return { generatedAt: '2026-10-27T22:00:00Z', filters: { days:'30', platform:'all', section:'Purchases' }, purchaseFlow: {
    summary: [{ attempts:3000, devices:2000, purchased:100, verified:80, activated:60, requested:2800, cancellations:20, errors:10, access_unconfirmed:40, incomplete:2870 }],
    daily:[], outcomes:[{outcome:'pending',attempts:4,devices:3},{outcome:'unresolved',attempts:2,devices:2}],
    surfaces:[{surface:'scan_upgrade',purchase_type:'scan',platform:'ios',attempts:10,purchased:2,verified:1,activated:1,cancellations:3}], failures:[], feedback:[], support:[], handoffs:[],
    coverage:[{paywall_views:9000,paywall_devices:5000,unlinked_starts:11,start_events:3011,detailed_starts:2900,latest_event:'2026-10-27T21:30:00',latest_receipt:'2026-10-27T21:31:00'}],
  } } as unknown as AnalyticsDashboard
}

test('purchase flow uses uncapped attempts and keeps observed, billing-confirmed and activated outcomes distinct', () => {
  const html=renderToStaticMarkup(<PurchaseFlowDashboard data={snapshot()} days={30} />)
  for(const value of ['3,000','100','80','60']) expect(html).toContain(`>${value}</p>`)
  expect(html).toContain('3.3% of tracked attempts')
  expect(html).toContain('60.0% of observed purchases')
  expect(html).toContain('includes trial starts')
  expect(html).toContain('Purchases without confirmed access activation: 40')
  expect(html).toContain('without the former 2,000-attempt timeline cap')
  expect(html).toContain('not fixed-maturity conversion cohorts')
  expect(html).not.toContain('Paid customers receiving their report')
})

test('pending, unresolved, coverage gaps and independent paywall reach remain explicit', () => {
  const html=renderToStaticMarkup(<PurchaseFlowDashboard data={snapshot()} days={30} />)
  expect(html).toContain('Awaiting payment approval')
  expect(html).toContain('Outcome not recorded')
  expect(html).toContain('neither classification establishes abandonment')
  expect(html).toContain('11 purchase start events lack an attempt identifier or device identity')
  expect(html).toContain('Paywall views and purchase starts are independent observations')
  expect(html).toContain('2:31 PM PDT')
  expect(html).toContain('independent of the mobile platform filter')
  expect(html).toContain('60-second cache')
})

test('empty or unavailable purchase data does not imply a measured zero conversion rate', () => {
  const data=snapshot()
  data.purchaseFlow!.summary=[{attempts:0,purchased:0,activated:0,verified:0}]
  const html=renderToStaticMarkup(<PurchaseFlowDashboard data={data} days={1} />)
  expect(html).not.toContain('NaN')
  expect(html).not.toContain('Infinity')
  expect(html).not.toContain('0.0% of tracked attempts')
  expect(html).toContain('No linked purchase attempts were recorded')
  expect(html).toContain('Purchase rate unavailable')
  expect(html).toContain('Activation rate unavailable')
  data.purchaseFlow=null
  expect(renderToStaticMarkup(<PurchaseFlowDashboard data={data} days={1} />)).toContain('Unavailable data is not shown as zero')
})

test('zero purchase buckets do not claim a visible shared purchase and activation line', () => {
  const data=snapshot()
  data.purchaseFlow!.daily=[{day:'2026-10-27T07:00:00Z',attempts:2,purchased:0,activated:0}]
  const html=renderToStaticMarkup(<PurchaseFlowDashboard data={data} days={30} />)
  expect(html).not.toContain('one line represents both')
})
