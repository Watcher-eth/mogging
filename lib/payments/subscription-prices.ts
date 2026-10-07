export const subscriptionProducts = [
  'mobile_subscription_weekly',
  'mobile_subscription_monthly',
  'mobile_subscription_yearly',
] as const
export type SubscriptionProduct = typeof subscriptionProducts[number]
export type SubscriptionPrices = {
  currency: string
  availableCurrencies: string[]
  amounts: Record<SubscriptionProduct, number>
}

// Stripe amounts use two minor-unit digits, including ISK and UGX.
const zeroDecimalCurrencies = new Set(['bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'vnd', 'vuv', 'xaf', 'xof', 'xpf'])
export function formatStripePrice(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: currency.toUpperCase() })
    .format(amount / (zeroDecimalCurrencies.has(currency.toLowerCase()) ? 1 : 100))
}

const countryCurrencies: Record<string, string> = {
  DE: 'eur', AT: 'eur', CH: 'chf', LI: 'chf', ES: 'eur', FR: 'eur', BE: 'eur', LU: 'eur', MC: 'eur',
  MX: 'mxn', AR: 'ars', BO: 'bob', CL: 'clp', CO: 'cop', CR: 'crc', CU: 'cup', DO: 'dop', EC: 'usd',
  SV: 'usd', GT: 'gtq', HN: 'hnl', NI: 'nio', PA: 'usd', PY: 'pyg', PE: 'pen', UY: 'uyu', VE: 'ves', PR: 'usd',
  CA: 'cad', HT: 'htg', MA: 'mad', DZ: 'dzd', TN: 'tnd', SN: 'xof', CI: 'xof', BF: 'xof', BJ: 'xof',
  ML: 'xof', NE: 'xof', TG: 'xof', CM: 'xaf', CF: 'xaf', TD: 'xaf', CG: 'xaf', GA: 'xaf', GQ: 'xaf',
  CD: 'cdf', MG: 'mga', MU: 'mur', SC: 'scr', DJ: 'djf', KM: 'kmf', GN: 'gnf', RW: 'rwf', BI: 'bif',
  CN: 'cny', SG: 'sgd', HK: 'hkd', TW: 'twd', US: 'usd', GB: 'gbp', AU: 'aud', NZ: 'nzd',
}
export function preferredCurrency(country: string | null) {
  return country ? countryCurrencies[country.toUpperCase()] : undefined
}

type CurrencyPrice = { currency: string; unit_amount: number | null; currency_options?: Record<string, { unit_amount: number | null }> }
export function priceAmounts(price: CurrencyPrice): Record<string, number> {
  const amounts: Record<string, number> = {}
  if (price.unit_amount !== null) amounts[price.currency] = price.unit_amount
  for (const [currency, option] of Object.entries(price.currency_options ?? {})) {
    if (option.unit_amount !== null) amounts[currency] = option.unit_amount
  }
  return amounts
}
