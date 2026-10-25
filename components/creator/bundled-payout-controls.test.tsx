import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { BundledPayoutControls } from './bundled-payout-controls'
import type { CreatorDashboard } from './types'

const data = { profile: { authStatus:'pending', paymentOption:'paypal', paypalEmail:'creator@example.com', bundledPayouts:true }, submissions:[{ id:'post',sprintId:'campaign',status:'approved',approvedAmountCents:1500 }], payments:[], payoutRequests:[] } as unknown as CreatorDashboard
function button(html:string) { const match=html.match(/<button[^>]*>Pay me now<\/button>/); expect(match).not.toBeNull();return match![0] }

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
