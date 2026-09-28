import { z } from 'zod'

const text = z.string().max(300).nullable().optional()
const time = z.number().int().nonnegative().max(8_640_000_000_000_000).nullable().optional()
export const revenueCatEventSchema = z.object({
  id: z.string().min(1).max(200), type: z.string().min(1).max(100),
  app_user_id: text, original_app_user_id: text, aliases: z.array(z.string().max(300)).max(200).optional(),
  transaction_id: text, original_transaction_id: text, product_id: text, new_product_id: text,
  environment: text, store: text, currency: text, country_code: text, period_type: text,
  cancel_reason: text, expiration_reason: text, presented_offering_id: text, offer_code: text,
  event_timestamp_ms: time, purchased_at_ms: time, expiration_at_ms: time, grace_period_expiration_at_ms: time,
  price: z.number().finite().nullable().optional(), price_in_purchased_currency: z.number().finite().nullable().optional(),
  commission_percentage: z.number().min(0).max(1).nullable().optional(), tax_percentage: z.number().min(0).max(1).nullable().optional(),
  is_trial_conversion: z.boolean().optional(), entitlement_ids: z.array(z.string().max(300)).optional(),
  transferred_from: z.array(z.string().max(300)).optional(), transferred_to: z.array(z.string().max(300)).optional(),
  subscriber_attributes: z.record(z.string(), z.object({ value: z.unknown().optional() })).optional(),
})
export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>

export function revenueCatLifecycle(event: Pick<RevenueCatEvent, 'type' | 'cancel_reason' | 'period_type' | 'is_trial_conversion'>) {
  switch (event.type) {
    case 'INITIAL_PURCHASE': return event.period_type === 'TRIAL' ? 'trial_started' : 'subscription_started'
    case 'RENEWAL': return event.is_trial_conversion ? 'trial_converted' : 'subscription_renewed'
    case 'NON_RENEWING_PURCHASE': return 'one_time_purchase'
    case 'CANCELLATION': return event.cancel_reason === 'CUSTOMER_SUPPORT' ? 'subscription_refunded' : 'cancellation_scheduled'
    case 'UNCANCELLATION': return 'subscription_reactivated'
    case 'EXPIRATION': return 'subscription_expired'
    case 'BILLING_ISSUE': return 'billing_issue_started'
    case 'PRODUCT_CHANGE': return 'subscription_product_changed'
    case 'SUBSCRIPTION_PAUSED': return 'subscription_pause_scheduled'
    case 'SUBSCRIPTION_EXTENDED': return 'subscription_extended'
    case 'REFUND_REVERSED': return 'refund_reversed'
    case 'TRANSFER': return 'subscription_transferred'
    case 'TEMPORARY_ENTITLEMENT_GRANT': return 'temporary_entitlement_granted'
    case 'TEST': return 'billing_test'
    default: return 'billing_other'
  }
}

export function normalizeRevenueCat(event: RevenueCatEvent, receivedAt = new Date()) {
  const eventName = revenueCatLifecycle(event)
  const charged = ['subscription_started', 'subscription_renewed', 'trial_converted', 'one_time_purchase', 'refund_reversed'].includes(eventName)
  const refunded = eventName === 'subscription_refunded'
  // RevenueCat `price` is USD; never label its fallback with purchased currency.
  const localPrice = event.price_in_purchased_currency != null && event.currency != null
  const amount = localPrice ? event.price_in_purchased_currency! : event.price
  const signedAmount = amount == null ? null : (charged ? 1 : refunded ? -1 : 0) * Math.abs(amount)
  const attribute = (key: string) => {
    const value = event.subscriber_attributes?.[key]?.value
    return typeof value === 'string' ? value.slice(0, 300) : null
  }
  return {
    provider: 'revenuecat', providerEventId: event.id, providerType: event.type,
    environment: event.environment === 'PRODUCTION' && event.type !== 'TEST' ? 'production' : 'sandbox',
    eventName, externalUserId: event.app_user_id ?? event.transferred_to?.[0] ?? null,
    subscriptionId: event.original_transaction_id ?? null, transactionId: event.transaction_id ?? null,
    productId: event.product_id ?? null, currency: localPrice ? event.currency!.toUpperCase() : 'USD',
    amount: signedAmount == null ? null : String(signedAmount),
    occurredAt: event.event_timestamp_ms != null ? new Date(event.event_timestamp_ms) : receivedAt,
    properties: {
      period_type: event.period_type ?? null, trial_conversion: event.is_trial_conversion ?? false,
      store: event.store ?? null, country: event.country_code ?? null,
      purchased_at_ms: event.purchased_at_ms ?? null, expiration_at_ms: event.expiration_at_ms ?? null,
      grace_period_expiration_at_ms: event.grace_period_expiration_at_ms ?? null,
      cancel_reason: event.cancel_reason ?? null, expiration_reason: event.expiration_reason ?? null,
      new_product_id: event.new_product_id ?? null, offering: event.presented_offering_id ?? null,
      offer_code: event.offer_code ?? null, commission_percentage: event.commission_percentage ?? null,
      tax_percentage: event.tax_percentage ?? null, entitlement_ids: event.entitlement_ids ?? [],
      aliases: event.aliases ?? [], transferred_from: event.transferred_from ?? [], transferred_to: event.transferred_to ?? [],
      mobile_install_id: attribute('mobile_install_id'), appsflyer_id: attribute('$appsflyerId'),
      creator_tracking_link_id: attribute('creator_tracking_link_id'),
      creator_first_tracking_link_id: attribute('creator_first_tracking_link_id'),
      timestamp_estimated: event.event_timestamp_ms == null,
    },
  }
}
