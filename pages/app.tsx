import Head from 'next/head'
import { useRouter } from 'next/router'
import { motion } from 'motion/react'
import { Check, Loader2, ShieldCheck, Smartphone, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

type CheckoutResponse = {
  url: string
}

type BillingTier = 'monthly' | 'yearly'

const appStoreUrl = process.env.NEXT_PUBLIC_IOS_APP_STORE_URL || 'https://apps.apple.com/app/id6771414050'
const baseDeepLink = process.env.NEXT_PUBLIC_APP_DEEP_LINK || 'mogging://reports'
const subscriptionStorageKey = 'mogging:web2app:subscription'
const installClickedStorageKey = 'mogging:web2app:install-clicked'

const tiers: Array<{
  id: BillingTier
  label: string
  price: string
  cadence: string
  note: string
}> = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$9.99',
    cadence: '/month',
    note: 'Start now, cancel when you want.',
  },
  {
    id: 'yearly',
    label: 'Yearly',
    price: '$59.99',
    cadence: '/year',
    note: 'Best value for progress tracking.',
  },
]

export default function AppFunnelPage() {
  const router = useRouter()
  const [selectedTier, setSelectedTier] = useState<BillingTier>('yearly')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [installClicked, setInstallClicked] = useState(false)
  const [openingApp, setOpeningApp] = useState(false)
  const source = useMemo(() => getSource(router.query.source, router.query.utm_source), [router.query.source, router.query.utm_source])
  const deepLink = useMemo(() => {
    const params = new URLSearchParams({
      source,
      tier: selectedTier,
      flow: 'web2app',
    })

    return `${baseDeepLink}${baseDeepLink.includes('?') ? '&' : '?'}${params.toString()}`
  }, [selectedTier, source])

  useEffect(() => {
    if (!router.isReady) return

    const tier = router.query.tier === 'monthly' || router.query.tier === 'yearly' ? router.query.tier : null
    if (tier) setSelectedTier(tier)

    const storedSubscription = window.localStorage.getItem(subscriptionStorageKey)
    const storedInstallClicked = window.localStorage.getItem(installClickedStorageKey) === 'true'
    const checkoutSucceeded = router.query.checkout === 'success'

    if (checkoutSucceeded) {
      window.localStorage.setItem(subscriptionStorageKey, JSON.stringify({
        tier: tier || selectedTier,
        sessionId: typeof router.query.session_id === 'string' ? router.query.session_id : null,
        source,
        completedAt: new Date().toISOString(),
      }))
      setPaid(true)
      toast.success('Subscription confirmed. Install the app to continue.')
    } else {
      setPaid(Boolean(storedSubscription))
    }

    setInstallClicked(storedInstallClicked)

    if (router.query.checkout === 'cancelled') {
      toast.error('Checkout was cancelled. Pick a plan when you are ready.')
    }
  }, [router.isReady, router.query.checkout, router.query.session_id, router.query.tier, selectedTier, source])

  async function startCheckout() {
    setCheckoutLoading(true)
    try {
      const response = await apiPost<CheckoutResponse>('/api/payments/mobile-subscription', {
        tier: selectedTier,
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
        <section className="mx-auto grid min-h-[calc(100vh-5rem)] w-full max-w-7xl grid-cols-1 gap-10 px-5 py-7 sm:px-10 sm:py-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(360px,0.78fr)] lg:items-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-8"
          >
            <div className="border-b border-zinc-200 pb-8">
              <p className="font-mono text-[11px] font-bold uppercase tracking-normal text-zinc-500">TikTok / Instagram mobile funnel //</p>
              <h1 className="mt-5 max-w-4xl text-[4rem] font-semibold leading-[0.84] tracking-[-0.075em] text-black sm:text-[7rem] lg:text-[8.5rem]">
                Get your score in the app.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-7 text-zinc-500 sm:text-xl sm:leading-8">
                Subscribe once on the web, install Mogging from the App Store, then return here and open directly into the mobile app.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['01', 'Pick a plan', 'Monthly or yearly subscription checkout.'],
                ['02', 'Install app', 'The next button sends you to the App Store.'],
                ['03', 'Open Mogging', 'Return here and launch the app with a deep link.'],
              ].map(([step, title, copy]) => (
                <div key={step} className="min-h-36 border border-zinc-200 bg-white p-4">
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">[ {step} ]</p>
                  <h2 className="mt-8 text-2xl font-semibold tracking-[-0.055em]">{title}</h2>
                  <p className="mt-2 text-sm leading-5 text-zinc-500">{copy}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.aside
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto w-full max-w-[440px] border border-zinc-200 bg-zinc-50 p-3 shadow-[0_26px_90px_rgba(15,23,42,0.10)]"
          >
            <div className="border border-zinc-200 bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">Mogging Pro</p>
                  <h2 className="mt-3 text-4xl font-semibold leading-none tracking-[-0.065em]">Mobile access</h2>
                </div>
                <span className="grid size-12 place-items-center border border-zinc-200 bg-black text-white">
                  <Smartphone className="size-5" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-7 grid gap-3">
                {tiers.map((tier) => {
                  const active = selectedTier === tier.id
                  return (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setSelectedTier(tier.id)}
                      className={cn(
                        'group grid min-h-24 grid-cols-[1fr_auto] items-center gap-4 border bg-white p-4 text-left transition duration-200 active:scale-[0.985]',
                        active ? 'border-black shadow-[inset_0_0_0_1px_#000]' : 'border-zinc-200 hover:border-zinc-400'
                      )}
                    >
                      <span>
                        <span className="block font-mono text-[10px] font-bold uppercase text-zinc-500">{tier.label}</span>
                        <span className="mt-2 block text-sm text-zinc-500">{tier.note}</span>
                      </span>
                      <span className="text-right">
                        <span className="text-3xl font-semibold tracking-[-0.06em]">{tier.price}</span>
                        <span className="block text-xs font-medium text-zinc-500">{tier.cadence}</span>
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-6 space-y-3 border-y border-zinc-200 py-5">
                {['Private mobile reports', 'Face comparison and progress tracking', 'Share graphics and score overlays'].map((item) => (
                  <div key={item} className="flex items-center gap-3 text-sm font-medium text-zinc-700">
                    <Check className="size-4 text-black" aria-hidden="true" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={paid && installClicked ? openInstalledApp : paid ? openAppStore : startCheckout}
                disabled={checkoutLoading || openingApp}
                className="mt-6 flex h-14 w-full items-center justify-center gap-2 bg-black px-5 text-sm font-semibold text-white transition duration-200 hover:bg-zinc-800 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checkoutLoading || openingApp ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : paid ? <Sparkles className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                {paid && installClicked ? 'Open in app' : paid ? 'Install from App Store' : `Continue ${selectedTier}`}
              </button>

              {paid ? (
                <button
                  type="button"
                  onClick={openInstalledApp}
                  className="mt-3 h-11 w-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-black transition duration-200 hover:bg-zinc-50 active:scale-[0.985]"
                >
                  Already installed? Open Mogging
                </button>
              ) : null}

              <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
                {paid
                  ? 'After installing, come back to this page and the primary button will open Mogging directly.'
                  : 'Secure checkout is handled by Stripe. App access starts after subscription checkout.'}
              </p>
            </div>
          </motion.aside>
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
