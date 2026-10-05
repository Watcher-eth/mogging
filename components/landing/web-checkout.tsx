import { useRouter } from 'next/router'
import { Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'

type CheckoutResponse = {
  url: string
}

type FunnelProduct =
  | 'evaluation'
  | 'evaluation_pack_3'
  | 'mobile_subscription_weekly'
  | 'mobile_subscription_monthly'
  | 'mobile_subscription_yearly'
  | 'mobile_lifetime'
  | 'extra_potential_image'

const webInstallStorageKey = 'mogging:web2app:web-install-id'

const tiers: Array<{
  id: FunnelProduct
  label: string
  price: string
  cadence: string
  note: string
  badge?: string
}> = [
  {
    id: 'mobile_subscription_weekly',
    label: 'Weekly',
    price: '$4.99',
    cadence: '/week',
    note: 'Flexible access for a short reset.',
  },
  {
    id: 'mobile_subscription_monthly',
    label: 'Monthly',
    price: '$9.99',
    cadence: '/month',
    note: 'Best for steady evaluation and tracking.',
    badge: 'Popular',
  },
  {
    id: 'mobile_subscription_yearly',
    label: 'Yearly',
    price: '$49.99',
    cadence: '/year',
    note: 'Lowest long-term price for full Pro.',
    badge: 'Best value',
  },
]

export function WebCheckout({ embedded = false, preview = false }: { embedded?: boolean; preview?: boolean }) {
  const router = useRouter()
  const [selectedProduct, setSelectedProduct] = useState<FunnelProduct>(
    'mobile_subscription_monthly',
  )
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
      toast.error('Checkout was cancelled. Pick a plan when you are ready.')
    }
  }, [
    router,
    router.isReady,
    router.query.checkout,
    router.query.product,
    sessionId,
  ])

  async function startWebCheckout() {
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
        },
      )
      window.location.href = response.url
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Unable to open checkout',
      )
      setCheckoutLoading(false)
    }
  }

  return (
    <>
      <div className={embedded ? '' : 'mx-auto max-w-5xl px-6 py-14 sm:px-10 sm:py-20'}>
        {!embedded && <>
          <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-5xl">Your next step. Mogging Pro.</h1>
          <p className="mx-auto mb-10 mt-5 max-w-xl text-center leading-7 text-zinc-500">Detailed evaluations, a personalized Protocol, and your progress in one place. Choose your plan to continue in the app.</p>
        </>}
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
                      {tier.label}
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
                        {tier.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className={embedded ? "mt-5 hidden text-sm leading-5 text-zinc-500 sm:block" : "mt-5 block text-sm leading-5 text-zinc-500"}>
                    {tier.note}
                  </span>
                </span>
                <span className="mt-8 block">
                  <span className={embedded ? "text-[clamp(1.5rem,6vw,3rem)] font-semibold tracking-[-0.07em]" : "text-5xl font-semibold tracking-[-0.07em]"}>
                    {tier.price}
                  </span>
                  <span className={embedded ? "mt-1 block text-xs font-medium text-zinc-500 sm:ml-2 sm:inline sm:text-sm" : "ml-2 text-sm font-medium text-zinc-500"}>
                    {tier.cadence}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <div className="mx-auto mt-8 max-w-md">
          <button
            type="button"
            onClick={startWebCheckout}
            disabled={checkoutLoading}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            {checkoutLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            {`Continue ${selectedProductLabel(selectedProduct)}`}
          </button>
          <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
            Secure checkout is handled by Stripe. After payment, install Mogging
            and open it from the confirmation page to continue your evaluation.
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
): FunnelProduct | null {
  const product = firstQueryValue(value)
  return product === 'mobile_subscription_weekly' ||
    product === 'mobile_subscription_monthly' ||
    product === 'mobile_subscription_yearly'
    ? product
    : null
}

function selectedProductLabel(product: FunnelProduct) {
  if (product === 'mobile_subscription_weekly') return 'weekly Pro'
  if (product === 'mobile_subscription_monthly') return 'monthly Pro'
  if (product === 'mobile_subscription_yearly') return 'yearly Pro'
  return 'monthly Pro'
}
