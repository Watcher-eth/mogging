import { useTranslation } from 'react-i18next'
import useSWR from 'swr'
import { formatStripePrice, type SubscriptionPrices, type SubscriptionProduct } from '@/lib/payments/subscription-prices'
import { useRouter } from 'next/router'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'

type CheckoutResponse = {
  url: string
}

const webInstallStorageKey = 'mogging:web2app:web-install-id'
const tiers = [
  { id: 'mobile_subscription_weekly', label: 'plan.weekly', cadence: 'plan.weekCadence', note: 'plan.weekNote', badge: null },
  { id: 'mobile_subscription_monthly', label: 'plan.monthly', cadence: 'plan.monthCadence', note: 'plan.monthNote', badge: 'plan.popular' },
  { id: 'mobile_subscription_yearly', label: 'plan.yearly', cadence: 'plan.yearCadence', note: 'plan.yearNote', badge: 'plan.bestValue' },
] as const

export function WebCheckout({ embedded = false, preview = false }: { embedded?: boolean; preview?: boolean }) {
  const router = useRouter()
  const { t, i18n } = useTranslation()
  const [currency, setCurrency] = useState<string>()
  const { data: prices, error: priceError, mutate: reloadPrices } = useSWR<SubscriptionPrices>(
    `/api/payments/subscription-prices${currency ? `?currency=${currency}` : ''}`,
    apiGet,
    { shouldRetryOnError: false, revalidateOnFocus: false },
  )
  const [selectedProduct, setSelectedProduct] = useState<SubscriptionProduct>(
    'mobile_subscription_monthly',
  )
  const selectedTier = tiers.find(tier => tier.id === selectedProduct)!
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [webInstallId, setWebInstallId] = useState<string | null>(null)
  const source = useMemo(
    () => embedded ? 'homepage' : getSource(router.query.source, router.query.utm_source),
    [embedded, router.query.source, router.query.utm_source],
  )
  const installId = useMemo(
    () => firstQueryValue(router.query.install_id) || null,
    [router.query.install_id],
  )
  const checkoutInstallId = installId ?? webInstallId
  const sessionId = useMemo(
    () => firstQueryValue(router.query.session_id) || null,
    [router.query.session_id],
  )
  useEffect(() => {
    if (!router.isReady) return
    setWebInstallId(ensureWebInstallId())
    const product = readProduct(router.query.product)
    if (product) setSelectedProduct(product)
    // Older receipts used the homepage. Keep one verified activation flow.
    if (router.query.checkout === 'success' && sessionId) {
      void router.replace(
        `/app/handoff?session_id=${encodeURIComponent(sessionId)}`,
      )
    } else if (router.query.checkout === 'cancelled') {
      toast.error(t('plan.cancelled'))
    }
  }, [
    router,
    router.isReady,
    router.query.checkout,
    router.query.product,
    sessionId,
    t,
  ])

  async function startWebCheckout() {
    if (!prices) return
    if (!preview) trackWebEvent('landing_cta_clicked', {
      destination: 'web_checkout',
      plan: selectedProduct,
      placement: embedded ? 'web_section' : 'web_checkout',
    })
    void flushWebAnalytics()
    const nextInstallId = checkoutInstallId ?? ensureWebInstallId()
    if (!checkoutInstallId) setWebInstallId(nextInstallId)

    setCheckoutLoading(true)
    try {
      const response = await apiPost<CheckoutResponse>(
        '/api/payments/web-checkout',
        {
          product: selectedProduct,
          mobileInstallId: nextInstallId,
          source,
          returnLocale: router.locale ?? 'en',
          currency: prices.availableCurrencies.length > 1 ? prices.currency : undefined,
          unitAmount: prices.amounts[selectedProduct],
          locale: i18n.language.startsWith('zh') ? 'zh' : i18n.language.split('-')[0],
        },
      )
      window.location.href = response.url
    } catch (error) {
      toast.error(
        t(error instanceof ApiClientError && error.status === 401 ? 'plan.signIn'
          : error instanceof ApiClientError && error.status === 409 ? 'plan.changed' : 'plan.checkoutError'),
      )
      void reloadPrices()
      setCheckoutLoading(false)
    }
  }

  return (
    <>
      <div className={embedded ? '' : 'mx-auto max-w-5xl px-6 py-14 sm:px-10 sm:py-20'}>
        {!embedded && <>
          <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">{t('plan.checkoutTitle')}</h1>
          <p className="mx-auto mb-10 mt-5 max-w-xl text-center leading-7 text-zinc-500">{t('plan.checkoutDescription')}</p>
        </>}
        {prices && prices.availableCurrencies.length > 1 && <label className="mb-4 flex items-center justify-end gap-2 text-sm text-zinc-500">
          {t('plan.currency')}
          <select value={prices.currency} onChange={event => setCurrency(event.target.value)} className="rounded-lg border border-zinc-200 bg-white px-2 py-1 text-black">
            {prices.availableCurrencies.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
          </select>
        </label>}
        <div className={embedded ? "grid grid-cols-3 gap-2 sm:gap-3" : "grid gap-3 md:grid-cols-3"}>
          {tiers.map((tier) => {
            const active = selectedProduct === tier.id
            return (
              <button
                aria-pressed={active}
                key={tier.id}
                type="button"
                onClick={() => {
                  if (!preview) trackWebEvent('plan_selected', {
                    plan: tier.id,
                    surface: 'landing',
                  })
                  setSelectedProduct(tier.id)
                }}
                className={cn(
                  'group grid min-h-48 grid-rows-[1fr_auto] rounded-[2rem] border bg-white p-5 text-left transition duration-200 active:scale-[0.985]',
                  embedded && 'min-h-40 rounded-3xl p-3 sm:min-h-48 sm:p-5',
                  active
                    ? 'border-black shadow-[inset_0_0_0_1px_#000,0_18px_48px_rgba(15,23,42,0.10)]'
                    : 'border-zinc-200 hover:border-zinc-400',
                )}
              >
                <span>
                  <span className={embedded ? "flex flex-col items-start gap-2 sm:flex-row sm:justify-between" : "flex items-start justify-between gap-3"}>
                    <span className="block font-mono text-[11px] font-bold uppercase text-zinc-500">
                      {t(tier.label)}
                    </span>
                    {tier.badge ? (
                      <span
                        className={cn(
                          'rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase',
                          tier.id === 'mobile_subscription_monthly'
                            ? 'bg-[#e5f1ff] text-[#007aff]'
                            : 'bg-[#e8f8ec] text-[#248a3d]',
                        )}
                      >
                        {t(tier.badge)}
                      </span>
                    ) : null}
                  </span>
                  <span className={embedded ? "mt-5 hidden text-sm leading-5 text-zinc-500 sm:block" : "mt-5 block text-sm leading-5 text-zinc-500"}>
                    {t(tier.note)}
                  </span>
                </span>
                <span className="mt-8 block">
                  <span className={embedded ? "text-[clamp(1.1rem,4vw,2.6rem)] break-words font-semibold tracking-[-0.07em]" : "text-5xl font-semibold tracking-[-0.07em]"}>
                    {prices ? formatStripePrice(prices.amounts[tier.id], prices.currency, i18n.language) : '—'}
                  </span>
                  <span className={embedded ? "mt-1 block text-xs font-medium text-zinc-500 sm:ml-2 sm:inline sm:text-sm" : "ml-2 text-sm font-medium text-zinc-500"}>
                    {t(tier.cadence)}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mx-auto mt-8 max-w-md">
          {prices && prices.availableCurrencies.length === 1 && <p className="mb-4 text-center text-xs leading-5 text-zinc-500">{t('plan.checkoutCurrency', { currency: prices.currency.toUpperCase() })}</p>}
          {!prices && <p role="status" className="mb-4 text-center text-sm text-zinc-500">
            {t(priceError ? 'plan.unavailable' : 'plan.loading')}
            {priceError && <button type="button" onClick={() => void reloadPrices()} className="ml-2 underline">{t('plan.retry')}</button>}
          </p>}
          <button
            type="button"
            onClick={startWebCheckout}
            disabled={checkoutLoading || !prices}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {checkoutLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {t('plan.continue', { plan: t(selectedTier.label) })}
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
            {t('plan.checkoutSecurity')}
          </p>
        </div>
      </div>
    </>
  )
}

function getSource(
  source: string | string[] | undefined,
  utmSource: string | string[] | undefined,
) {
  const value = firstQueryValue(source) || firstQueryValue(utmSource)
  if (!value) return 'web2app'

  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 80) || 'web2app'
  )
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function ensureWebInstallId() {
  const existing = window.localStorage.getItem(webInstallStorageKey)
  if (existing && existing.length >= 8) return existing

  const next = `web_${crypto.randomUUID()}`
  window.localStorage.setItem(webInstallStorageKey, next)
  return next
}

function readProduct(
  value: string | string[] | undefined,
): SubscriptionProduct | null {
  const product = firstQueryValue(value)
  return product === 'mobile_subscription_weekly' ||
    product === 'mobile_subscription_monthly' ||
    product === 'mobile_subscription_yearly'
    ? product
    : null
}
