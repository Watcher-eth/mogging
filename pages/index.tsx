import Link from 'next/link'
import { SeoHead } from '@/components/app/seo-head'
import { appStoreUrl, siteUrl } from '@/lib/seo'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { ClipboardList, Loader2, ScanFace, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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

const appScreenshots = [
  {
    src: '/app-screenshots/report-potential.png',
    alt: 'Mogging facial report showing overall and potential scores',
  },
  {
    src: '/app-screenshots/protocol-ascend.png',
    alt: 'Mogging personalized protocol timeline with daily improvement tasks',
  },
  {
    src: '/app-screenshots/tracking-baseline.png',
    alt: 'Mogging evaluation history showing symmetry progress over time',
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

// Illustrative layout copy. Replace with sourced reviews before presenting as customer feedback.
const reviewCards = [
  { title: 'Finally knew where to start', rating: 5, body: 'I had about 20 things I thought I needed to fix. The report helped me narrow it down, and the protocol is simple enough that I actually use it.' },
  { title: 'The little details', rating: 4, body: 'The scans look stunning. Really clean, minimalist UI too. There’s a lot in the report, so it took me a bit to get through the first one.' },
  { title: 'More to work with', rating: 5, body: 'I tried FaceIQ Labs before this. Mogging feels much more comprehensive to me, especially when I want to understand the individual features instead of just the score.' },
  { title: 'Kept this one', rating: 4, body: 'I used the PSL app first. I prefer Mogging — the scan is easier to follow and I like having a straightforward protocol alongside it. Would love more history filters.' },
  { title: 'Simple, but it helps', rating: 5, body: 'The protocol isn’t some huge complicated routine. A few things to focus on each day. That’s been much more effective for me than saving advice I never follow.' },
  { title: 'Less guessing', rating: 4, body: 'Mostly wanted to understand what I was looking at in my photos. The face map helped with that. I try to keep the lighting the same now when I scan.' },
  { title: 'Cleanest app on my phone', rating: 5, body: 'No clutter, no five menus to find my last scan. The whole thing feels really considered. The report screens are honestly gorgeous.' },
  { title: 'Good report, still learning', rating: 3, body: 'There’s more detail than I expected. Some of the terms went over my head at first, but the routine is easy to follow. I’m still figuring out what matters most for me.' },
  { title: 'A routine I can stick to', rating: 4, body: 'I don’t open it constantly. I check my protocol, do the basics, and come back for another scan. Pretty much what I wanted.' },
  { title: 'Worth taking a proper photo', rating: 5, body: 'My first photo had terrible lighting. Retook it properly and the breakdown made a lot more sense. I like being able to go back and compare reports.' },
]
const averageRating = (reviewCards.reduce((sum, review) => sum + review.rating, 0) / reviewCards.length).toFixed(1)


export default function AppFunnelPage() {
  const router = useRouter()
  const [selectedProduct, setSelectedProduct] = useState<FunnelProduct>('mobile_subscription_monthly')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [webInstallId, setWebInstallId] = useState<string | null>(null)
  const source = useMemo(() => getSource(router.query.source, router.query.utm_source), [router.query.source, router.query.utm_source])
  const installId = useMemo(() => firstQueryValue(router.query.install_id) || null, [router.query.install_id])
  const checkoutInstallId = installId ?? webInstallId
  const sessionId = useMemo(() => firstQueryValue(router.query.session_id) || null, [router.query.session_id])
  useEffect(() => {
    if (!router.isReady) return
    setWebInstallId(ensureWebInstallId())
    const product = readProduct(router.query.product)
    if (product) setSelectedProduct(product)
    // Older receipts used the homepage. Keep one verified activation flow.
    if (router.query.checkout === 'success' && sessionId) {
      void router.replace(`/app/handoff?session_id=${encodeURIComponent(sessionId)}`)
    } else if (router.query.checkout === 'cancelled') {
      toast.error('Checkout was cancelled. Pick a plan when you are ready.')
    }
  }, [router, router.isReady, router.query.checkout, router.query.product, sessionId])

  async function startWebCheckout() {
    trackWebEvent('landing_cta_clicked', { destination: 'web_checkout', plan: selectedProduct })
    void flushWebAnalytics()
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

  return (
    <>
      <SeoHead
        title="Mogging App | Face Analysis & Personalized Routines"
        description="Discover Mogging, the comprehensive face analysis app. Get detailed facial reports, personalized routines, and track your progress. Download Mogging for iPhone."
        path="/"
        structuredData={{
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': `${siteUrl}/#website`, name: 'Mogging', url: `${siteUrl}/` },
            { '@type': 'Organization', '@id': `${siteUrl}/#organization`, name: 'Mogging', url: `${siteUrl}/`, logo: `${siteUrl}/favicon.png`, sameAs: [appStoreUrl] },
          ],
        }}
      />

      <main className="min-h-[calc(100vh-5rem)] overflow-hidden bg-white text-black">
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl flex-col items-center px-5 py-8 sm:px-10 sm:py-12">
          <div
            className="flex w-full flex-col items-center"
          >
            <a
              href={appStoreUrl}
              onClick={() => { trackWebEvent('app_store_redirected', { destination: 'app_store', placement: 'hero' }); void flushWebAnalytics() }}
              className="inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-5 py-2.5 text-base font-semibold text-black shadow-[0_10px_34px_rgba(15,23,42,0.08)] transition duration-200 hover:border-zinc-300 hover:bg-white active:scale-[0.985]"
            >
              <AppStoreMark className="size-8" />
              <span>View Mogging on the App Store</span>
            </a>

            <p className="mt-10 font-mono text-sm font-bold uppercase tracking-normal text-zinc-500 sm:text-base">Mogging · Comprehensive face analysis</p>
            <h1 className="mt-5 max-w-6xl text-center text-[3.6rem] font-semibold leading-[0.9] tracking-[-0.075em] text-black sm:text-[7rem] lg:text-[8.6rem]">
              Mogging. Your face, in focus.
            </h1>
            <p className="mt-7 max-w-3xl text-center text-xl leading-8 text-zinc-500 sm:text-2xl sm:leading-9">
              Explore your facial features with a comprehensive report, a detailed face map, and a personalized routine. Keep track of your photos and progress in the Mogging app.
            </p>
          </div>

          <div
            className="mt-16 w-full sm:mt-20"
          >
            <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 pr-5 sm:justify-center sm:gap-6 sm:overflow-visible sm:pr-0">
              {appScreenshots.map((screenshot, index) => (
                <div key={screenshot.src} className="w-[74vw] min-w-[260px] max-w-[340px] shrink-0 snap-start overflow-hidden rounded-[2rem] border border-zinc-200 bg-white sm:w-[30%] sm:rounded-[2.25rem]">
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    width={1242}
                    height={2688}
                    sizes="(max-width: 639px) 74vw, 30vw"
                    className="block h-auto w-full"
                    priority={index === 0}
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
                      onClick={() => { trackWebEvent('plan_selected', { plan: tier.id, surface: 'landing' }); setSelectedProduct(tier.id) }}
                      className={cn(
                        'group grid min-h-48 grid-rows-[1fr_auto] rounded-[2rem] border bg-white p-5 text-left transition duration-200 active:scale-[0.985]',
                        active ? 'border-black shadow-[inset_0_0_0_1px_#000,0_18px_48px_rgba(15,23,42,0.10)]' : 'border-zinc-200 hover:border-zinc-400'
                      )}
                    >
                      <span>
                        <span className="flex items-start justify-between gap-3">
                          <span className="block font-mono text-[11px] font-bold uppercase text-zinc-500">{tier.label}</span>
                          {tier.badge ? <span className={cn("rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase", tier.id === "mobile_subscription_monthly" ? "bg-[#e5f1ff] text-[#007aff]" : "bg-[#e8f8ec] text-[#248a3d]")}>{tier.badge}</span> : null}
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
                  onClick={startWebCheckout}
                  disabled={checkoutLoading}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white transition duration-200 hover:bg-zinc-800 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checkoutLoading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
                  {`Continue ${selectedProductLabel(selectedProduct)}`}
                </button>

                <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
                  Secure checkout is handled by Stripe. After payment, install Mogging and open it from the confirmation page to continue your evaluation.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}

function ReviewsSection() {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const observer = new IntersectionObserver(([entry]) => {
      viewport.dataset.visible = String(entry.isIntersecting)
    })
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  function pause() {
    const viewport = viewportRef.current
    const track = viewport?.firstElementChild
    if (!viewport || !track || viewport.dataset.paused === 'true') return
    const transform = getComputedStyle(track).transform
    const offset = transform === 'none' ? 0 : -new DOMMatrixReadOnly(transform).m41
    // Transfer the compositor position to native scrolling once, when someone interacts.
    const scrollLeft = viewport.scrollLeft + offset
    viewport.dataset.paused = 'true'
    viewport.scrollLeft = scrollLeft
  }

  return (
    <section aria-labelledby="reviews-title" className="mx-auto mt-16 w-full max-w-7xl py-2 text-zinc-950 sm:mt-20">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 px-1">
        <div>
          <h2 id="reviews-title" className="text-[1.7rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2rem]">Ratings &amp; Reviews</h2>
          <p id="reviews-disclosure" className="mt-3 text-xs text-zinc-500">Sample reviews · illustrative copy, not customer testimonials.</p>
        </div>
      </div>
      <div className="mb-9 grid gap-6 px-1 lg:grid-cols-[240px_1fr] lg:items-end">
        <div className="flex items-end gap-3">
          <span className="text-[5.6rem] font-semibold leading-[0.76] tracking-[-0.08em] text-zinc-500 sm:text-[6.5rem]">{averageRating}</span>
          <span className="pb-2 text-xl font-semibold text-zinc-500">out of 5</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-end">
          <div className="text-lg font-semibold text-zinc-500 sm:text-right">{reviewCards.length} samples</div>
          <div className="grid gap-2" aria-label="Sample rating distribution">
            {[5, 4, 3, 2, 1].map((stars) => (
              <div key={stars} className="grid grid-cols-[90px_1fr] items-center gap-3">
                <span className="text-right text-[13px] leading-none text-zinc-500" aria-label={`${stars} stars`}>{'★'.repeat(stars)}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200">
                  <div className="h-full rounded-full bg-zinc-500" style={{ width: `${reviewCards.filter(review => review.rating === stars).length / reviewCards.length * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div ref={viewportRef} className="reviews-viewport" tabIndex={0} role="region" aria-label="Scrollable sample reviews" aria-describedby="reviews-disclosure reviews-scroll-hint" onPointerDown={pause} onWheel={pause} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) pause() }}>
        <div className="reviews-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="reviews-group" aria-hidden={copy === 1 ? true : undefined}>
              {reviewCards.map((review, index) => (
                <article key={review.title} className="review-card rounded-[1.5rem] bg-zinc-100 p-6 text-zinc-700">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-[22px] leading-none text-[#ff8a1f]" role="img" aria-label={`${review.rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></span>
                    <span className="text-xs text-zinc-500">Sample {String(index + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mb-3 text-lg font-semibold leading-6">{review.title}</h3>
                  <p className="text-base leading-7">{review.body}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
      <p id="reviews-scroll-hint" className="mt-3 px-1 text-xs text-zinc-500">Swipe or scroll to read at your own pace.</p>
    </section>
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
