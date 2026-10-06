import { SeoHead } from '@/components/app/seo-head'
import { appStoreUrl, siteUrl } from '@/lib/seo'
import Image from 'next/image'
import { useEffect, useRef } from 'react'
import type { LandingAssignment } from '@/lib/analytics/landing'
import { WebCheckout } from './web-checkout'
import { useLandingTracking } from './use-landing-tracking'

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
  {
    src: '/app-screenshots/leaderboard-global.png',
    alt: 'Mogging global leaderboard with rankings and a top-three podium',
  },
]

// Illustrative layout copy. Replace with sourced reviews before presenting as customer feedback.
const reviewCards = [
  { author: 'ryan.k', title: 'Finally knew where to start', rating: 5, body: 'I had about 20 things I thought I needed to fix. The report helped me narrow it down, and the protocol is simple enough that I actually use it.' },
  { author: 'marco_f', title: 'The little details', rating: 4, body: 'The scans look stunning. Really clean, minimalist UI too. There’s a lot in the report, so it took me a bit to get through the first one.' },
  { author: 'alexnorth', title: 'More to work with', rating: 5, body: 'I tried FaceIQ Labs before this. Mogging feels much more comprehensive to me, especially when I want to understand the individual features instead of just the score.' },
  { author: 'daniel.j', title: 'Kept this one', rating: 4, body: 'I used the PSL app first. I prefer Mogging — the scan is easier to follow and I like having a straightforward protocol alongside it. Would love more history filters.' },
  { author: 'jakebuilds', title: 'Simple, but it helps', rating: 5, body: 'The protocol isn’t some huge complicated routine. A few things to focus on each day. That’s been much more effective for me than saving advice I never follow.' },
  { author: 'sam.r', title: 'Less guessing', rating: 4, body: 'Mostly wanted to understand what I was looking at in my photos. The face map helped with that. I try to keep the lighting the same now when I scan.' },
  { author: 'noahw', title: 'Cleanest app on my phone', rating: 5, body: 'No clutter, no five menus to find my last scan. The whole thing feels really considered. The report screens are honestly gorgeous.' },
  { author: 'ethan_27', title: 'Good report, still learning', rating: 3, body: 'There’s more detail than I expected. Some of the terms went over my head at first, but the routine is easy to follow. I’m still figuring out what matters most for me.' },
  { author: 'mia.l', title: 'A routine I can stick to', rating: 4, body: 'I don’t open it constantly. I check my protocol, do the basics, and come back for another scan. Pretty much what I wanted.' },
  { author: 'luke_m', title: 'Worth taking a proper photo', rating: 5, body: 'My first photo had terrible lighting. Retook it properly and the breakdown made a lot more sense. I like being able to go back and compare reports.' },
]
const averageRating = (reviewCards.reduce((sum, review) => sum + review.rating, 0) / reviewCards.length).toFixed(1)


export default function LegacyHomepage({assignment, preview}: {assignment: LandingAssignment; preview: boolean}) {
  const {sections, trackDestination} = useLandingTracking(assignment, preview)
  return <>
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

      <main ref={sections} className="min-h-[calc(100vh-5rem)] overflow-hidden bg-white text-black">
        <section className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl flex-col items-center px-5 py-8 sm:px-10 sm:py-12">
          <div
            className="flex w-full flex-col items-center"
          >
            <a
              href={appStoreUrl}
              onClick={() => trackDestination('app_store', 'hero')}
              className="inline-flex items-center gap-3 rounded-full border border-zinc-200 bg-zinc-50 px-5 py-2.5 text-base font-semibold text-black shadow-[0_10px_34px_rgba(15,23,42,0.08)] transition duration-200 hover:border-zinc-300 hover:bg-white active:scale-[0.985]"
            >
              <AppStoreMark className="size-8" />
              <span>View Mogging on the App Store</span>
            </a>

            <p className="mt-10 font-mono text-sm font-bold uppercase tracking-normal text-zinc-500 sm:text-base">Ascend now with</p>
            <h1 className="mt-5 max-w-6xl text-center text-[3.6rem] font-semibold leading-[0.9] tracking-[-0.075em] text-black sm:text-[7rem] lg:text-[8.6rem]">
              Mogging. Your face, in focus.
            </h1>
            <p className="mt-7 max-w-3xl text-center text-xl leading-8 text-zinc-500 sm:text-2xl sm:leading-9">
              Explore your facial features with a comprehensive report, a detailed face map, and a personalized routine. Keep track of your photos and progress in the Mogging app.
            </p>
          </div>

          <div data-landing-section="screenshots"
            className="mx-auto mt-16 w-full max-w-6xl sm:mt-20"
          >
            <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 sm:gap-6 lg:grid lg:grid-cols-4 lg:overflow-visible">
              {appScreenshots.map((screenshot, index) => (
                <div key={screenshot.src} className="w-[74vw] min-w-[260px] max-w-[340px] shrink-0 snap-start overflow-hidden rounded-[2rem] border border-zinc-200 bg-white sm:w-[280px] sm:rounded-[2.25rem] lg:w-auto lg:min-w-0 lg:max-w-none">
                  <Image
                    src={screenshot.src}
                    alt={screenshot.alt}
                    width={1242}
                    height={2688}
                    sizes="(max-width: 639px) 74vw, (max-width: 1023px) 280px, (max-width: 1279px) 23vw, 270px"
                    className="block h-auto w-full"
                    priority={index === 0}
                  />
                </div>
              ))}
            </div>

            <ReviewsSection />

            <div data-landing-section="web_checkout" className="mx-auto mt-16 w-full max-w-5xl sm:mt-20"><WebCheckout embedded preview={preview} /></div>
          </div>
        </section>
      </main>
  </>
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
    <section data-landing-section="reviews" aria-labelledby="reviews-title" className="mx-auto mt-16 w-full py-2 text-zinc-950 sm:mt-20">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 px-1">
        <div>
          <h2 id="reviews-title" className="text-[1.7rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2rem]">Example feedback</h2>
        </div>
      </div>
      <p className="mb-5 text-sm text-zinc-500">Illustrative feedback from the original design, not verified customer ratings.</p>
      <div className="mb-9 grid gap-6 px-1 lg:grid-cols-[240px_1fr] lg:items-end">
        <div className="flex items-end gap-3">
          <span className="text-[5.6rem] font-semibold leading-[0.76] tracking-[-0.08em] text-zinc-500 sm:text-[6.5rem]">{averageRating}</span>
          <span className="pb-2 text-xl font-semibold text-zinc-500">out of 5</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-end">
          <div className="text-lg font-semibold text-zinc-500 sm:text-right">Illustrative reviews</div>
          <div className="grid gap-2" aria-label=" rating distribution">
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
      <div ref={viewportRef} className="reviews-viewport" tabIndex={0} role="region" aria-label="Scrollable feedback" onPointerDown={pause} onWheel={pause} onKeyDown={(event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) pause() }}>
        <div className="reviews-track">
          {[0, 1].map((copy) => (
            <div key={copy} className="reviews-group" aria-hidden={copy === 1 ? true : undefined}>
              {reviewCards.map((review) => (
                <article key={review.title} className="review-card rounded-[1.5rem] bg-zinc-100 p-6 text-zinc-700">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-[22px] leading-none text-[#ff8a1f]" role="img" aria-label={`${review.rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></span>
                    <span className="text-xs text-zinc-500">{review.author}</span>
                  </div>
                  <h3 className="mb-3 text-lg font-semibold leading-6">{review.title}</h3>
                  <p className="text-base leading-7">{review.body}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
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
