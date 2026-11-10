import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AnalyticsDashboard } from '@/lib/admin/analytics'
import { PurchaseFlowDashboard } from './purchase-flow-dashboard'

function snapshot(): AnalyticsDashboard {
  return { generatedAt: '2026-10-27T22:00:00Z', filters: { days:'30', platform:'all', section:'Purchases' }, purchaseFlow: {
    summary: [{ attempts:3000, devices:2000, purchased:100, verified:80, activated:60, requested:2800, cancellations:20, errors:10,restricted:6,technical_errors:4,unresolved:2866,pending:4, access_unconfirmed:40, incomplete:2870 }],
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
  expect(html).toContain('Missing final outcome')
  expect(html).toContain('Technical errors')
  expect(html).toContain('0.1% of attempts')
  expect(html).toContain('Stripe payment signals')
  expect(html).toContain('not a second purchase funnel')
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

test('missing prices remain visible separately from attempted purchases and by release', () => {
  const data=snapshot()
  data.purchaseFlow!.catalog=[{release:'1.52(92)',availability:'empty',reason:'product_request_timed_out',loads:3,devices:1,average_ms:15000}]
  const html=renderToStaticMarkup(<PurchaseFlowDashboard data={data} days={14} />)
  expect(html).toContain('Subscription price loading')
  expect(html).toContain('1.52(92)')
  expect(html).toContain('No plans loaded')
  expect(html).toContain('not every paywall view or Apple review session')
})

test('all-source paid purchases lead the page and immature timing is not a zero conversion rate',()=>{
 const data=snapshot()
 data.purchaseBehavior={summary:[{purchases:7,buyers:3,single_scans:3,bundles:2,renewals:1,repeat_scan_buyers:1,first_buyers:3,timing_linked_first_buyers:2}],
  daily:[{day:'2026-10-27T07:00:00Z',purchases:7,app_store:4,stripe:2,google_play:1,other:0}],
  products:[{kind:'single_scan',purchases:3,buyers:3,renewals:0},{kind:'scan_bundle',purchases:2,buyers:1,renewals:0}],
  combinations:[{combination:'scans_and_subscription',buyers:1}],frequency:[{scan_orders:'2',buyers:1,also_subscription:1}],
  firstPurchase:[{bucket:1,buyers:2}],signupWindows:[{window_days:14,accounts:3,eligible:0,pending:3,buyers:0}],repeatWindows:[]}
 data.purchaseBehavior!.sources=[{payment_source:'app_store',purchases:4,buyers:2,first_buyers:2,renewals:1,single_scans:1,bundles:1,subscription_payments:2},{payment_source:'stripe',purchases:2,buyers:1,first_buyers:1,renewals:0,single_scans:1,bundles:1,subscription_payments:0}]
 const html=renderToStaticMarkup(<PurchaseFlowDashboard data={data} days={30}/>)
 expect(html.indexOf('Paid purchases')).toBeLessThan(html.indexOf('App purchase attempt diagnostics'))
 expect(html).toContain('Apple App Store')
 expect(html).toContain('Stripe / web')
 expect(html).toContain('Google Play')
 expect(html).toContain('Scans and subscription')
 expect(html).toContain('Compare payment channels')
 expect(html).toContain('Apple App Store')
 expect(html).toContain('Stripe / web')
 expect(html).toContain('/admin/analytics/revenue?days=30')
 expect(html).toContain('Timing available for 2 of 3')
 expect(html).toContain('still maturing')
 expect(html).not.toContain('one line represents both')
 expect(html).toContain('<svg')
})
