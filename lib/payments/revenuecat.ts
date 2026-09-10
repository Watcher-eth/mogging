import { ApiError } from '@/lib/api/http'
import { env } from '@/lib/env'

export const scanProducts = [
  { productId: env.REVENUECAT_SCAN_PRODUCT_ID, product: 'evaluation' as const, credits: 1, title: 'Single scan', detail: 'One full facial evaluation' },
  { productId: env.REVENUECAT_SCAN_PACK_PRODUCT_ID, product: 'evaluation_pack_3' as const, credits: 3, title: 'Three scans', detail: 'Track changes across three evaluations' },
]

export type RevenueCatSubscriber = {
  entitlements?: Record<string, { expires_date?: string | null; product_identifier?: string | null }>
  non_subscriptions?: Record<string, Array<{
    id: string
    store_transaction_id?: string
    store?: string
    is_sandbox?: boolean
    refunded_at?: string | null
  }>>
}

export async function fetchRevenueCatSubscriber(appUserId: string, required = false): Promise<RevenueCatSubscriber | null> {
  if (!env.REVENUECAT_SECRET_API_KEY) {
    if (required) throw new ApiError(503, 'Purchases are temporarily unavailable. Please try again later.')
    return null
  }
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) {
    if (required) throw new ApiError(503, 'Your purchase could not be verified yet. Please retry.')
    return null
  }
  const body = await response.json() as { subscriber?: RevenueCatSubscriber }
  if (!body.subscriber && required) throw new ApiError(503, 'Your purchase could not be verified yet. Please retry.')
  return body.subscriber ?? null
}

export function readRevenueCatPro(subscriber: RevenueCatSubscriber | null) {
  const entitlement = subscriber?.entitlements?.[env.REVENUECAT_PRO_ENTITLEMENT_ID]
  if (!entitlement) return null
  const currentPeriodEnd = entitlement.expires_date ? new Date(entitlement.expires_date) : null
  const active = !currentPeriodEnd || currentPeriodEnd.getTime() > Date.now()
  return { active, status: active ? 'active' : 'expired', currentPeriodEnd, productIdentifier: entitlement.product_identifier ?? null }
}

export function readRevenueCatScanPurchases(subscriber: RevenueCatSubscriber) {
  return scanProducts.flatMap((product) =>
    (subscriber.non_subscriptions?.[product.productId] ?? [])
      .filter((purchase) => typeof purchase.id === 'string' && purchase.id.length > 0)
      .map((purchase) => ({
        ...product,
        // RevenueCat's purchase ID is stable across webhooks, restores and account aliases.
        key: `revenuecat:${purchase.id}`,
        transactionId: purchase.store_transaction_id ?? purchase.id,
        refunded: Boolean(purchase.refunded_at),
        sandbox: Boolean(purchase.is_sandbox),
      }))
  )
}
