export type PurchaseEvent = { event: string; at: string; properties: Record<string, unknown> }
export type PurchaseAttemptRow = {
  id: string; device: string; platform: string; release: string; started: string;
  events: PurchaseEvent[]; verified: boolean; sandbox?: boolean;
}
export type PurchaseOutcome = 'activated' | 'purchased_access_failed' | 'purchased_access_pending' | 'account_required' |
  'cancelled' | 'preparation_failed' | 'store_failed' | 'pending' | 'in_progress' | 'unresolved'
export function describePurchaseAttempt(row: PurchaseAttemptRow, now: number) {
  const events = row.events
  const find = (name: string) => events.find(event => event.event === name)
  const latest = [...events].reverse()
  const reconciled = events.some(event => event.event === 'purchase_reconciled' && ['provider_purchase_observed', 'activated'].includes(String(event.properties.result)))
  const purchased = Boolean(find('purchase_completed') || reconciled || row.verified)
  const activated = Boolean(find('purchase_activated') || events.some(event => event.event === 'purchase_reconciled' && event.properties.result === 'activated'))
  const result = latest.find(event => ['purchase_cancelled', 'purchase_failed', 'purchase_pending', 'purchase_activation_failed', 'purchase_account_required'].includes(event.event))
  let outcome: PurchaseOutcome
  if (activated) outcome = 'activated'
  else if (purchased) outcome = result?.event === 'purchase_activation_failed' ? 'purchased_access_failed' : result?.event === 'purchase_account_required' ? 'account_required' : 'purchased_access_pending'
  else if (result?.event === 'purchase_pending' || result?.properties.reason_code === 'payment_pending') outcome = 'pending'
  else if (result?.event === 'purchase_cancelled') outcome = 'cancelled'
  else if (result?.event === 'purchase_failed') outcome = result.properties.purchase_stage === 'store_purchase' ? 'store_failed' : 'preparation_failed'
  else outcome = now - Date.parse(row.started) < 120_000 ? 'in_progress' : 'unresolved'
  const context = Object.assign({}, ...events.map(event => event.properties))
  const checkout = find('checkout_started')
  const completion = find('purchase_completed')
  const feedback = find('purchase_cancel_feedback')
  return { ...row, context, purchased, activated, requested: Boolean(checkout), outcome,
    reason: String(result?.properties.reason_code ?? ''), stage: String(result?.properties.purchase_stage ?? context.purchase_stage ?? 'unknown'),
    storeDurationMs: checkout && (completion || result) ? Math.max(0, Date.parse((completion ?? result)!.at) - Date.parse(checkout.at)) : null,
    feedback: feedback?.properties.feedback_reason ?? null,
  }
}
