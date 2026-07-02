import Head from 'next/head'
import { useRouter } from 'next/router'
import { motion } from 'motion/react'
import { Check, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

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

const appStoreUrl = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050'
const baseDeepLink = process.env.NEXT_PUBLIC_APP_DEEP_LINK || 'mogging://reports'
const subscriptionStorageKey = 'mogging:web2app:subscription'
const installClickedStorageKey = 'mogging:web2app:install-clicked'

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

const appScreenshots = [
  {
    src: '/app-screenshots/for-you.png',
    alt: 'Mogging For You timeline and skin check screen',
  },
  {
    src: '/app-screenshots/evaluation.png',
    alt: 'Mogging evaluation screen with face analysis overlays',
  },
  {
    src: '/app-screenshots/protocol.png',
    alt: 'Mogging personalized protocol report screen',
  },
]

export default function AppFunnelPage() {
  const router = useRouter()
  const [selectedProduct, setSelectedProduct] = useState<FunnelProduct>('mobile_subscription_monthly')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [installClicked, setInstallClicked] = useState(false)
  const [openingApp, setOpeningApp] = useState(false)
  const source = useMemo(() => getSource(router.query.source, router.query.utm_source), [router.query.source, router.query.utm_source])
  const installId = useMemo(() => firstQueryValue(router.query.install_id) || null, [router.query.install_id])
  const sessionId = useMemo(() => firstQueryValue(router.query.session_id) || null, [router.query.session_id])
  const deepLink = useMemo(() => {
    const deepLinkBase = installId ? 'mogging://generating' : baseDeepLink
    const params = new URLSearchParams({
      source,
      product: selectedProduct,
      flow: 'web2app',
    })
    if (installId) params.set('install_id', installId)
    if (sessionId) params.set('session_id', sessionId)
    if (router.query.checkout === 'success') params.set('checkout', 'success')

    return `${deepLinkBase}${deepLinkBase.includes('?') ? '&' : '?'}${params.toString()}`
  }, [installId, router.query.checkout, selectedProduct, sessionId, source])

  useEffect(() => {
    if (!router.isReady) return

    const product = readProduct(router.query.product)
    if (product) setSelectedProduct(product)

    const storedSubscription = window.localStorage.getItem(subscriptionStorageKey)
    const storedInstallClicked = window.localStorage.getItem(installClickedStorageKey) === 'true'
    const checkoutSucceeded = router.query.checkout === 'success'

    if (checkoutSucceeded) {
      window.localStorage.setItem(subscriptionStorageKey, JSON.stringify({
        product: product || selectedProduct,
        sessionId: typeof router.query.session_id === 'string' ? router.query.session_id : null,
        installId,
        source,
        completedAt: new Date().toISOString(),
      }))
      setPaid(true)
      toast.success('Purchase confirmed. Open the app to claim access.')
    } else {
      setPaid(Boolean(storedSubscription))
    }

    setInstallClicked(storedInstallClicked)

    if (router.query.checkout === 'cancelled') {
      toast.error('Checkout was cancelled. Pick a plan when you are ready.')
    }
  }, [installId, router.isReady, router.query.checkout, router.query.product, router.query.session_id, selectedProduct, source])

  async function startWebCheckout() {
    if (!installId) {
      toast.error('Open this checkout from the Mogging app so we can attach the purchase to your device.')
      return
    }

    setCheckoutLoading(true)
    try {
      const response = await apiPost<CheckoutResponse>('/api/payments/web-checkout', {
        product: selectedProduct,
        mobileInstallId: installId,
        source,
      })
      window.location.href = response.url
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Unable to open checkout')
      setCheckoutLoading(false)
    }
  }

  function openAppStore() {
    window.localStorage.setItem(installClickedStorageKey, 'true')
    setInstallClicked(true)
    window.location.href = appStoreUrl
  }

  function openInstalledApp() {
    setOpeningApp(true)
    const fallbackTimer = window.setTimeout(() => {
      window.location.href = appStoreUrl
    }, 1400)

    const clearFallback = () => window.clearTimeout(fallbackTimer)
    window.addEventListener('pagehide', clearFallback, { once: true })
    window.addEventListener('blur', clearFallback, { once: true })
    window.location.href = deepLink

    window.setTimeout(() => {
      setOpeningApp(false)
    }, 1700)
  }

  return (
    <>
      <Head>
        <title>Mogging App | Mobile Face Analysis</title>
        <meta name="description" content="Subscribe on the web, install Mogging, then open the mobile app to start your face analysis." />
      </Head>

      <main className="min-h-[calc(100vh-5rem)] overflow-hidden bg-white text-black">
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl flex-col items-center px-5 py-8 sm:px-10 sm:py-12">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full flex-col items-center"
          >
            <a
              href={appStoreUrl}
              className="inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-black shadow-[0_10px_34px_rgba(15,23,42,0.08)] transition duration-200 hover:border-zinc-300 hover:bg-white active:scale-[0.985]"
            >
              <AppStoreMark className="size-7" />
              <span>View Mogging on the App Store</span>
            </a>

            <p className="mt-9 font-mono text-[11px] font-bold uppercase tracking-normal text-zinc-500">Mobile face analysis //</p>
            <h1 className="mt-4 max-w-5xl text-center text-[3.4rem] font-semibold leading-[0.9] tracking-[-0.075em] text-black sm:text-[6.5rem] lg:text-[8rem]">
              Subscribe on web. Use Mogging in app.
            </h1>
            <p className="mt-6 max-w-2xl text-center text-lg leading-7 text-zinc-500 sm:text-xl sm:leading-8">
              Start Pro access from the web, then open the iOS app for evaluations, reports, protocol tracking, and score sharing.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-12 w-full"
          >
            <div className="flex gap-4 overflow-x-auto px-[max(0px,calc((100vw-80rem)/2))] pb-4 sm:justify-center sm:overflow-visible sm:px-0">
              {appScreenshots.map((screenshot) => (
                <div key={screenshot.src} className="w-[74vw] min-w-[260px] max-w-[340px] shrink-0 overflow-hidden rounded-[2.25rem] bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)] ring-1 ring-zinc-200/80 sm:w-[30%]">
                  <img
                    src={screenshot.src}
                    alt={screenshot.alt}
                    className="block h-auto w-full"
                    loading="eager"
                  />
                </div>
              ))}
            </div>

            <div className="mx-auto mt-10 w-full max-w-5xl">
              <div className="grid gap-3 md:grid-cols-3">
                {tiers.map((tier) => {
                  const active = selectedProduct === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedProduct(tier.id)}
                      className={cn(
                        'group grid min-h-48 grid-rows-[1fr_auto] rounded-[2rem] border bg-white p-5 text-left transition duration-200 active:scale-[0.985]',
                        active ? 'border-black shadow-[inset_0_0_0_1px_#000,0_18px_48px_rgba(15,23,42,0.10)]' : 'border-zinc-200 hover:border-zinc-400'
                      )}
                    >
                      <span>
                        <span className="flex items-start justify-between gap-3">
                          <span className="block font-mono text-[11px] font-bold uppercase text-zinc-500">{tier.label}</span>
                          {tier.badge ? <span className="rounded-full bg-zinc-100 px-3 py-1 font-mono text-[10px] font-bold uppercase text-zinc-600">{tier.badge}</span> : null}
                        </span>
                        <span className="mt-5 block text-sm leading-5 text-zinc-500">{tier.note}</span>
                      </span>
                      <span className="mt-8 block">
                        <span className="text-5xl font-semibold tracking-[-0.07em]">{tier.price}</span>
                        <span className="ml-2 text-sm font-medium text-zinc-500">{tier.cadence}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mx-auto mt-7 grid max-w-3xl gap-3 sm:grid-cols-3">
                {['Unlimited app evaluations', 'Protocol and report tracking', 'Battle and sharing tools'].map((item) => (
                  <div key={item} className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                    <Check className="size-4 text-black" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="mx-auto mt-7 max-w-md">
                <button
                  type="button"
                  onClick={paid && installClicked ? openInstalledApp : paid ? openAppStore : installId ? startWebCheckout : openAppStore}
                  disabled={checkoutLoading || openingApp}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white transition duration-200 hover:bg-zinc-800 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading || openingApp ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : paid ? <Sparkles className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                  {paid && installClicked ? 'Open in app' : paid ? 'Install from App Store' : `Continue ${selectedProductLabel(selectedProduct)}`}
                </button>

                {paid ? (
                  <button
                    type="button"
                    onClick={openInstalledApp}
                    className="mt-3 h-11 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-black transition duration-200 hover:bg-zinc-50 active:scale-[0.985]"
                  >
                    Already installed? Open Mogging
                  </button>
                ) : null}

                <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
                  {paid
                    ? 'After installing, come back to this page and the primary button will open Mogging directly.'
                    : installId ? 'Secure checkout is handled by Stripe. App access is claimed when you return to Mogging.' : 'Open this page from the app to attach purchases to your install.'}
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      </main>
    </>
  )
}

function getSource(source: string | string[] | undefined, utmSource: string | string[] | undefined) {
  const value = firstQueryValue(source) || firstQueryValue(utmSource)
  if (!value) return 'web2app'

  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 80) || 'web2app'
}

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function readProduct(value: string | string[] | undefined): FunnelProduct | null {
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

function AppStoreMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" role="img">
      <rect width="48" height="48" rx="12" fill="url(#app-store-mark-gradient)" />
      <path
        d="M19.75 31.9h-5.4a2 2 0 0 1 0-4h7.58l2.33-4.06-4.88-8.45a2 2 0 1 1 3.46-2l3.73 6.47 3.72-6.47a2 2 0 1 1 3.47 2L24.3 31.9a2.61 2.61 0 0 1-4.55 0Zm13.9 0h-5.43l2.31-4h3.12a2 2 0 1 1 0 4Zm-18.1 5.44a2 2 0 0 1-.74-2.73l1.26-2.18h4.62l-2.4 4.17a2 2 0 0 1-2.74.74Z"
        fill="white"
      />
      <defs>
        <linearGradient id="app-store-mark-gradient" x1="8" x2="42" y1="40" y2="7" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A84FF" />
          <stop offset="1" stopColor="#5AC8FA" />
        </linearGradient>
      </defs>
    </svg>
  )
}
