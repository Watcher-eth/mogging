import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { motion } from 'motion/react'
import { ClipboardList, Loader2, ScanFace, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

type CheckoutResponse = {
  url: string
}

type ActivationCodeResponse = {
  activationCode: string
  product: string | null
}

type FunnelProduct =
  | 'evaluation'
  | 'evaluation_pack_3'
  | 'mobile_subscription_weekly'
  | 'mobile_subscription_monthly'
  | 'mobile_subscription_yearly'
  | 'mobile_lifetime'
  | 'extra_potential_image'

const appStoreUrl = 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050'
const baseDeepLink = process.env.NEXT_PUBLIC_APP_DEEP_LINK || 'mogging://reports'
const subscriptionStorageKey = 'mogging:web2app:subscription'
const installClickedStorageKey = 'mogging:web2app:install-clicked'
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

const appScreenshots = [
  {
    src: '/app-screenshots/protocol-ascend.png',
    alt: 'Mogging personalized protocol timeline with daily improvement tasks',
  },
  {
    src: '/app-screenshots/tracking-baseline.png',
    alt: 'Mogging evaluation history showing symmetry progress over time',
  },
  {
    src: '/app-screenshots/potential-report.png',
    alt: 'Mogging facial report showing overall and potential scores',
  },
]

const featurePills = [
  {
    label: '66-measure scan',
    icon: ScanFace,
  },
  {
    label: 'Detailed face map',
    icon: Sparkles,
  },
  {
    label: 'Personalized Protocol',
    icon: ClipboardList,
  },
]

const reviewCards = [
  {
    title: 'Protocol actually made me consistent',
    rating: 5,
    age: '2mo ago',
    author: 'ryanlooks',
    body: 'The scan called out my jaw blur, posture and under-eye issues, then turned it into a daily protocol. I stuck to it for 6 weeks and my photos look way cleaner.',
  },
  {
    title: 'Best glow up app if you follow it',
    rating: 5,
    age: '1mo ago',
    author: 'marco.f',
    body: 'I used to jump between random looksmaxing advice. Mogging made it obvious what to work on first: hair framing, skin texture, shoulder posture and debloat habits. Big difference.',
  },
  {
    title: 'The report is brutally useful',
    rating: 4,
    age: '3w ago',
    author: 'aidenbuilds',
    body: 'The score was cool, but the protocol is why I kept using it. Same lighting, repeat scans, clear todos. My face looks more structured because I finally tracked the basics.',
  },
]

export default function AppFunnelPage() {
  const router = useRouter()
  const [selectedProduct, setSelectedProduct] = useState<FunnelProduct>('mobile_subscription_monthly')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [installClicked, setInstallClicked] = useState(false)
  const [openingApp, setOpeningApp] = useState(false)
  const [webInstallId, setWebInstallId] = useState<string | null>(null)
  const [activationCode, setActivationCode] = useState<string | null>(null)
  const [activationCodeLoading, setActivationCodeLoading] = useState(false)
  const source = useMemo(() => getSource(router.query.source, router.query.utm_source), [router.query.source, router.query.utm_source])
  const installId = useMemo(() => firstQueryValue(router.query.install_id) || null, [router.query.install_id])
  const checkoutInstallId = installId ?? webInstallId
  const sessionId = useMemo(() => firstQueryValue(router.query.session_id) || null, [router.query.session_id])
  const deepLink = useMemo(() => {
    const deepLinkBase = sessionId ? 'mogging://generating' : baseDeepLink
    const params = new URLSearchParams({
      source,
      product: selectedProduct,
      flow: 'web2app',
    })
    if (checkoutInstallId) params.set('install_id', checkoutInstallId)
    if (sessionId) params.set('session_id', sessionId)
    if (router.query.checkout === 'success') params.set('checkout', 'success')

    return `${deepLinkBase}${deepLinkBase.includes('?') ? '&' : '?'}${params.toString()}`
  }, [checkoutInstallId, router.query.checkout, selectedProduct, sessionId, source])

  useEffect(() => {
    if (!router.isReady) return

    const currentWebInstallId = ensureWebInstallId()
    setWebInstallId(currentWebInstallId)

    const product = readProduct(router.query.product)
    if (product) setSelectedProduct(product)

    const storedSubscription = window.localStorage.getItem(subscriptionStorageKey)
    const storedInstallClicked = window.localStorage.getItem(installClickedStorageKey) === 'true'
    const checkoutSucceeded = router.query.checkout === 'success'

    if (checkoutSucceeded) {
      window.localStorage.setItem(subscriptionStorageKey, JSON.stringify({
        product: product || selectedProduct,
        sessionId: typeof router.query.session_id === 'string' ? router.query.session_id : null,
        installId: installId ?? currentWebInstallId,
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

  useEffect(() => {
    if (!router.isReady || router.query.checkout !== 'success' || !sessionId) return

    let cancelled = false
    setActivationCodeLoading(true)

    apiGet<ActivationCodeResponse>(`/api/payments/activation-code?session_id=${encodeURIComponent(sessionId)}`)
      .then((response) => {
        if (!cancelled) setActivationCode(response.activationCode)
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof ApiClientError ? error.message : 'Unable to load activation code')
        }
      })
      .finally(() => {
        if (!cancelled) setActivationCodeLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [router.isReady, router.query.checkout, sessionId])

  async function startWebCheckout() {
    const nextInstallId = checkoutInstallId ?? ensureWebInstallId()
    if (!checkoutInstallId) setWebInstallId(nextInstallId)

    setCheckoutLoading(true)
    try {
      const response = await apiPost<CheckoutResponse>('/api/payments/web-checkout', {
        product: selectedProduct,
        mobileInstallId: nextInstallId,
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
        <title>Mogging App | Face Analysis and Improvement Protocol</title>
        <meta
          name="description"
          content="Mogging scans your face across 66 clinical-style measures, maps facial structure in detail, and builds a personalized protocol to track and improve your look over time."
        />
        <meta name="apple-itunes-app" content="app-id=6771414050, app-argument=https://mogging.com/" />
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
              className="inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-5 py-2.5 text-base font-semibold text-black shadow-[0_10px_34px_rgba(15,23,42,0.08)] transition duration-200 hover:border-zinc-300 hover:bg-white active:scale-[0.985]"
            >
              <AppStoreMark className="size-8" />
              <span>View Mogging on the App Store</span>
            </a>

            <p className="mt-10 font-mono text-sm font-bold uppercase tracking-normal text-zinc-500 sm:text-base">Mobile face analysis //</p>
            <h1 className="mt-5 max-w-6xl text-center text-[3.6rem] font-semibold leading-[0.9] tracking-[-0.075em] text-black sm:text-[7rem] lg:text-[8.6rem]">
              Your looks. Measured. Tracked. Improved.
            </h1>
            <p className="mt-7 max-w-3xl text-center text-xl leading-8 text-zinc-500 sm:text-2xl sm:leading-9">
              Scan across 66 clinical-style facial measures, review a detailed face map, and follow a personalized protocol built to improve what your report finds over time.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-16 w-full sm:mt-20"
          >
            <div className="flex gap-5 overflow-x-auto px-[max(0px,calc((100vw-80rem)/2))] pb-4 sm:justify-center sm:gap-6 sm:overflow-visible sm:px-0">
              {appScreenshots.map((screenshot) => (
                <div key={screenshot.src} className="w-[74vw] min-w-[260px] max-w-[340px] shrink-0 overflow-hidden rounded-[2rem] border border-zinc-200 bg-white sm:w-[30%] sm:rounded-[2.25rem]">
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    width={1242}
                    height={2688}
                    sizes="(max-width: 639px) 74vw, 30vw"
                    className="block h-auto w-full"
                    priority
                  />
                </div>
              ))}
            </div>

            <ReviewsSection />

            <div className="mx-auto mt-16 w-full max-w-5xl sm:mt-20">
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
                {featurePills.map((item) => {
                  const Icon = item.icon
                  return (
                    <div key={item.label} className="flex items-center justify-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-medium text-zinc-700">
                      <Icon className="size-4 text-black" strokeWidth={2.25} aria-hidden="true" />
                      <span>{item.label}</span>
                  </div>
                  )
                })}
              </div>

              <div className="mx-auto mt-7 max-w-md">
                <button
                  type="button"
                  onClick={paid ? openInstalledApp : startWebCheckout}
                  disabled={checkoutLoading || openingApp}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white transition duration-200 hover:bg-zinc-800 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading || openingApp ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : paid ? <Sparkles className="size-4" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                  {paid ? 'Open in app' : `Continue ${selectedProductLabel(selectedProduct)}`}
                </button>

                {paid ? (
                  <button
                    type="button"
                    onClick={openAppStore}
                    className="mt-3 h-11 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-black transition duration-200 hover:bg-zinc-50 active:scale-[0.985]"
                  >
                    Download from App Store
                  </button>
                ) : null}

                {paid ? (
                  <div className="mt-4 rounded-[1.5rem] border border-zinc-200 bg-zinc-50 p-4 text-center">
                    <p className="font-mono text-[10px] font-bold uppercase text-zinc-500">Backup activation code</p>
                    <div className="mt-2 flex h-12 items-center justify-center rounded-2xl bg-white font-mono text-2xl font-bold tracking-[0.28em] text-black shadow-inner">
                      {activationCodeLoading ? <Loader2 className="size-5 animate-spin text-zinc-400" aria-hidden="true" /> : activationCode ? activationCode : '------'}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-zinc-500">
                      If opening the app does not activate Pro, tap <span className="font-semibold text-zinc-700">Use Code</span> inside the app and enter this code.
                    </p>
                  </div>
                ) : null}

                <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
                  {paid
                    ? 'Open Mogging from this page to claim access. If the app is not installed yet, the open button will fall back to the App Store.'
                    : 'Secure checkout is handled by Stripe. After payment, install Mogging and open it from this page to claim access.'}
                </p>
              </div>
            </div>
          </motion.div>
        </section>
      </main>
    </>
  )
}

function ReviewsSection() {
  return (
    <section className="mx-auto mt-16 w-full max-w-7xl rounded-[2rem] bg-white px-0 py-2 text-zinc-950 sm:mt-20">
      <div className="mb-7 flex items-start justify-between gap-6 px-1">
        <h2 className="text-[1.7rem] font-semibold leading-none tracking-[-0.04em] text-zinc-900 sm:text-[2rem]">
          Ratings &amp; Reviews
        </h2>
        <a href={appStoreUrl} className="text-base font-semibold text-[#007aff] transition hover:text-[#0062cc] sm:text-lg">
          See All
        </a>
      </div>

      <div className="mb-9 grid gap-6 px-1 lg:grid-cols-[240px_1fr] lg:items-end">
        <div className="flex items-end gap-3">
          <span className="text-[5.6rem] font-semibold leading-[0.76] tracking-[-0.08em] text-zinc-500 sm:text-[6.5rem]">4.8</span>
          <span className="pb-2 text-xl font-semibold text-zinc-500">out of 5</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-end">
          <div className="text-left text-lg font-semibold text-zinc-500 sm:text-right">243 Ratings</div>
          <RatingDistribution />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {reviewCards.map((review) => (
          <article key={review.title} className="min-h-[224px] rounded-[1.5rem] bg-zinc-100 p-6 text-zinc-700">
            <div className="mb-2 grid grid-cols-[1fr_auto] gap-4">
              <h3 className="text-lg font-semibold leading-6 text-zinc-700">{review.title}</h3>
              <span className="text-base font-semibold text-zinc-500">{review.age}</span>
            </div>
            <div className="mb-5 grid grid-cols-[1fr_auto] items-center gap-4">
              <StarRating rating={review.rating} />
              <span className="text-base font-semibold text-zinc-500">{review.author}</span>
            </div>
            <p className="text-lg font-medium leading-7 text-zinc-700">{review.body}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function RatingDistribution() {
  const rows = [
    { stars: 5, value: 0.82 },
    { stars: 4, value: 0.13 },
    { stars: 3, value: 0.04 },
    { stars: 2, value: 0.01 },
    { stars: 1, value: 0.02 },
  ]

  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.stars} className="grid grid-cols-[90px_1fr] items-center gap-3">
          <div className="flex justify-end gap-0.5 text-[13px] leading-none text-zinc-500">
            {Array.from({ length: row.stars }).map((_, index) => (
              <span key={`${row.stars}-${index}`}>★</span>
            ))}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-zinc-500" style={{ width: `${row.value * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1 text-[22px] leading-none text-[#ff8a1f]" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index}>{index < rating ? '★' : '☆'}</span>
      ))}
    </div>
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

function ensureWebInstallId() {
  const existing = window.localStorage.getItem(webInstallStorageKey)
  if (existing && existing.length >= 8) return existing

  const next = `web_${crypto.randomUUID()}`
  window.localStorage.setItem(webInstallStorageKey, next)
  return next
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
