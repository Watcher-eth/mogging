import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BundledPayoutControls } from './bundled-payout-controls'
import { MissingPaymentData } from './missing-payment-data'
import { PayoutInformation } from './payout-information-form'
import { SWRConfig } from 'swr'
import type { CreatorDashboard } from './types'

const data = { profile: { authStatus:'pending', paymentOption:'paypal', paypalEmail:'creator@example.com', bundledPayouts:true }, submissions:[{ id:'post',sprintId:'campaign',status:'approved',approvedAmountCents:1500 }], payments:[], payoutRequests:[] } as unknown as CreatorDashboard
function button(html:string) { const match=html.match(/<button[^>]*>Pay me now<\/button>/); expect(match).not.toBeNull();return match![0] }

test('missing payout warnings and the bank option only appear for the affected creator cohort', () => {
  function render(value: CreatorDashboard) {
    return renderToStaticMarkup(<SWRConfig value={{ provider: () => new Map(), fallback: { '/api/creator': value } }}><MissingPaymentData data={value} /><PayoutInformation email="creator@example.com" /></SWRConfig>)
  }
  const affected = { ...data, profile: { ...data.profile!, paypalEmail: null } }
  const html = render(affected)
  expect(html).toContain('Missing Payment Data')
  expect(html).toContain('Bank transfer')
  expect(html).toContain('High fees')
  for (const value of [data, { ...affected, submissions: [] }, { ...affected, payments: [{ submissionId: 'post', status: 'paid', amountCents: 1500 }] } as CreatorDashboard]) {
    expect(render(value)).not.toContain('Missing Payment Data')
    expect(render(value)).not.toContain('Bank transfer')
  }
})

test('a valid saved method enables the payout request without manual verification', () => {
 const html=renderToStaticMarkup(<BundledPayoutControls data={data} onSaved={async()=>{}} />)
 expect(button(html)).not.toMatch(/\sdisabled(?:=|>)/)
 expect(html).not.toContain('needs approval')
})
test('suspension and missing destinations keep the payout request disabled with actionable copy', () => {
 for(const profile of [{...data.profile!,authStatus:'suspended' as const},{...data.profile!,paypalEmail:null}]){
  const html=renderToStaticMarkup(<BundledPayoutControls data={{...data,profile}} onSaved={async()=>{}} />)
  expect(button(html)).toMatch(/\sdisabled(?:=|>)/)
  expect(html).not.toContain('needs approval')
 }
})
