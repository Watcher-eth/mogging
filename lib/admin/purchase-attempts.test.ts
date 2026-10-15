import { expect,test } from 'bun:test'
import { describePurchaseAttempt,type PurchaseEvent,type PurchaseAttemptRow } from './purchase-attempts'
const start='2026-10-14T00:00:00Z'
function row(events:PurchaseEvent[],verified=false):PurchaseAttemptRow { return {id:'1',device:'d',release:'1.39',platform:'ios',started:start,events,verified} }
const event=(name:string,seconds:number,properties:Record<string,unknown>={}):PurchaseEvent => ({event:name,at:new Date(Date.parse(start)+seconds*1000).toISOString(),properties})
const now=Date.parse(start)+3600000

test('a background interruption without a callback remains unresolved',() => {
  expect(describePurchaseAttempt(row([event('purchase_started',0),event('checkout_started',1),event('purchase_app_state',2,{app_state:'inactive'})]),now).outcome).toBe('unresolved')
})
test('pending approval is not a failed or cancelled payment, including older pending errors',() => {
  expect(describePurchaseAttempt(row([event('purchase_pending',3)]),now).outcome).toBe('pending')
  expect(describePurchaseAttempt(row([event('purchase_failed',3,{reason_code:'payment_pending'})]),now).outcome).toBe('pending')
})
test('store cancellation and errors before the store are separated',() => {
  expect(describePurchaseAttempt(row([event('purchase_cancelled',4)]),now).outcome).toBe('cancelled')
  expect(describePurchaseAttempt(row([event('purchase_failed',1,{purchase_stage:'purchase_preparation'})]),now).outcome).toBe('preparation_failed')
  expect(describePurchaseAttempt(row([event('purchase_failed',1,{purchase_stage:'store_purchase'})]),now).outcome).toBe('store_failed')
})
test('activation errors cannot turn a successful purchase into a store failure',() => {
  const attempt=describePurchaseAttempt(row([event('checkout_started',1),event('purchase_completed',5),event('purchase_activation_failed',6,{reason_code:'credits_not_active'})]),now)
  expect(attempt.outcome).toBe('purchased_access_failed'); expect(attempt.purchased).toBe(true); expect(attempt.storeDurationMs).toBe(4000)
})
test('a late provider transaction overrides unresolved or cancelled observations without claiming activation',() => {
  const attempt=describePurchaseAttempt(row([event('purchase_cancelled',4)],true),now)
  expect(attempt.outcome).toBe('purchased_access_pending'); expect(attempt.activated).toBe(false)
})
test('successful later reconciliation supersedes an earlier activation error',() => {
  const events=[event('purchase_completed',5),event('purchase_activation_failed',6),event('purchase_reconciled',50,{result:'activated'})]
  expect(describePurchaseAttempt(row(events),now).outcome).toBe('activated')
})
test('account linking is explicit and recent unreturned calls are not declared failures',() => {
  expect(describePurchaseAttempt(row([event('purchase_completed',5),event('purchase_account_required',6)]),now).outcome).toBe('account_required')
  expect(describePurchaseAttempt(row([event('purchase_started',0)]),Date.parse(start)+1000).outcome).toBe('in_progress')
})
