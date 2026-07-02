import { env } from '@/lib/env'

type RevenueCatSubscriberResponse = {
  subscriber?: {
    entitlements?: Record<
      string,
      {
        expires_date?: string | null
        product_identifier?: string | null
      }
    >
  }
}

export async function verifyRevenueCatPro(appUserId: string) {
  if (!env.REVENUECAT_SECRET_API_KEY) return null

  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: {
      Authorization: `Bearer ${env.REVENUECAT_SECRET_API_KEY}`,
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    console.error('RevenueCat verification failed', response.status, await response.text().catch(() => ''))
    return null
  }

  const body = (await response.json()) as RevenueCatSubscriberResponse
  const entitlement = body.subscriber?.entitlements?.[env.REVENUECAT_PRO_ENTITLEMENT_ID]
  if (!entitlement) return null

  const currentPeriodEnd = entitlement.expires_date ? new Date(entitlement.expires_date) : null
  const active = !currentPeriodEnd || currentPeriodEnd.getTime() > Date.now()

  return {
    active,
    status: active ? 'active' : 'expired',
    currentPeriodEnd,
    productIdentifier: entitlement.product_identifier ?? null,
  }
}
