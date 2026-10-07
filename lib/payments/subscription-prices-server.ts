import { ApiError } from '@/lib/api/http'
import { getProductConfig } from './entitlements'
import { getStripe } from './stripe'
import { priceAmounts, subscriptionProducts, type SubscriptionPrices } from './subscription-prices'

let cached: { expires: number; defaults: string[]; amounts: Record<string, Record<string, number>> } | undefined

export async function getSubscriptionPrices(currency?: string): Promise<SubscriptionPrices> {
  if (!cached || cached.expires < Date.now()) {
    const prices = await Promise.all(subscriptionProducts.map(async product => {
      const config = getProductConfig(product)
      if (!config.priceId) throw new ApiError(503, 'Subscription prices are not configured')
      const price = await getStripe().prices.retrieve(config.priceId, { expand: ['currency_options'] })
      if (!price.active || price.recurring?.interval !== config.interval || price.recurring?.interval_count !== 1 || price.billing_scheme !== 'per_unit') {
        throw new ApiError(503, 'Subscription prices are not available')
      }
      return { product, price }
    }))
    cached = {
      expires: Date.now() + 60_000,
      defaults: prices.map(({ price }) => price.currency),
      amounts: Object.fromEntries(prices.map(({ product, price }) => [product, priceAmounts(price)])),
    }
  }
  const availableCurrencies = Object.keys(cached.amounts[subscriptionProducts[0]])
    .filter(code => subscriptionProducts.every(product => cached!.amounts[product][code] !== undefined)).sort()
  const selected = currency && availableCurrencies.includes(currency) ? currency : cached.defaults.find(code => availableCurrencies.includes(code)) ?? availableCurrencies[0]
  if (!selected) throw new ApiError(503, 'Subscription currencies are not configured')
  return {
    currency: selected,
    availableCurrencies,
    amounts: Object.fromEntries(subscriptionProducts.map(product => [product, cached!.amounts[product][selected]])) as SubscriptionPrices['amounts'],
  }
}
