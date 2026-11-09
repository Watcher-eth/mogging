export const webAnalysisPlans = {
  web_basic_weekly: { tier: 'basic', name: 'Mogging Basic', interval: 'week', unitAmount: 899, scans: 4, lookupKey: 'mogging_web_basic_weekly_v2' },
  web_basic_monthly: { tier: 'basic', name: 'Mogging Starter', interval: 'month', unitAmount: 1799, scans: 4, lookupKey: 'mogging_web_basic_monthly_v1' },
  web_pro_monthly: { tier: 'pro', name: 'Mogging Pro', interval: 'month', unitAmount: 2999, scans: 8, lookupKey: 'mogging_web_pro_monthly_v1' },
} as const

export type WebAnalysisProduct = keyof typeof webAnalysisPlans
export const webAnalysisProducts = Object.keys(webAnalysisPlans) as WebAnalysisProduct[]

const mobileWebAnalysisPrices = {
  web_basic_weekly: { unitAmount: 699, lookupKey: 'mogging_mobile_web_basic_weekly_v1' },
  web_basic_monthly: { unitAmount: 1499, lookupKey: 'mogging_mobile_web_basic_monthly_v1' },
  web_pro_monthly: { unitAmount: 1999, lookupKey: 'mogging_mobile_web_pro_monthly_v1' },
} as const

export function getWebAnalysisPrice(product: WebAnalysisProduct, mobile = false) {
  const plan = webAnalysisPlans[product]
  return mobile ? { ...plan, ...mobileWebAnalysisPrices[product] } : plan
}

export function webAnalysisProductForLookupKey(lookupKey: string | null | undefined) {
  if (lookupKey === 'mogging_web_basic_weekly_v1') return 'web_basic_weekly'
  return webAnalysisProducts.find(product => [webAnalysisPlans[product].lookupKey, mobileWebAnalysisPrices[product].lookupKey].some(key => key === lookupKey))
}

export function webAnalysisCheckoutLimit(product: WebAnalysisProduct) {
  const plan = webAnalysisPlans[product]
  return plan.tier === 'basic' ? 1 : plan.scans
}
export const WEB_ANALYSIS_CREATOR_COUPON = 'mogging_web_creator_first_invoice_10_v1'
export const WEB_ANALYSIS_CREATOR_PERCENT = 10
export const webAnalysisStripeProducts = {
  web_basic_weekly: 'mogging_web_basic_v2',
  web_basic_monthly: 'mogging_web_basic_v1',
  web_pro_monthly: 'mogging_web_pro_v1',
} as const
export const webStarterIntro = {
  product: 'web_basic_monthly',
  coupon: 'mogging_web_starter_first_month_v1',
  currency: 'usd',
  firstMonth: 999,
  discount: webAnalysisPlans.web_basic_monthly.unitAmount - 999,
  durationMs: 5 * 60_000,
} as const

export function getWebStarterIntro(mobile = false) {
  if (!mobile) return webStarterIntro
  return {
    ...webStarterIntro,
    coupon: 'mogging_mobile_web_starter_first_month_v1',
    discount: mobileWebAnalysisPrices.web_basic_monthly.unitAmount - webStarterIntro.firstMonth,
  }
}

export function isWebAnalysisProduct(product: unknown): product is WebAnalysisProduct {
  return typeof product === 'string' && Object.hasOwn(webAnalysisPlans, product)
}
