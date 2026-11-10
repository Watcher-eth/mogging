import dynamic from 'next/dynamic'
import { useDesktop } from './use-desktop'
import { usePhoneLayout } from '@/hooks/use-phone-layout'
import { EvaluationChoices } from './evaluation-choices'
import { LazyMotion, domAnimation } from 'motion/react'
import * as m from 'motion/react-m'
import { useHomepageEntrance } from './use-homepage-entrance'
import { SeoHead } from '@/components/app/seo-head'
import { appStoreUrl, siteUrl } from '@/lib/seo'
import { EvaluationPreview, ProtocolPreview, ProgressPreview } from './mobile-preview'
import { useEffect, useRef } from 'react'
import type { LandingAssignment } from '@/lib/analytics/landing'
import { WebCheckout } from './web-checkout'
import { useLandingTracking } from './use-landing-tracking'

const DesktopScanPreview = dynamic(() => import('./desktop-scan-preview').then(module => module.DesktopScanPreview))
const DesktopMemberPreview = dynamic(() => import('./desktop-member-preview').then(module => module.DesktopMemberPreview))

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
  const entrance = useHomepageEntrance()
  const desktop = useDesktop()
  const phone = usePhoneLayout(true)
  return <LazyMotion features={domAnimation}>
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
        <section className="public-frame public-gutters flex min-h-[calc(100vh-5rem)] flex-col items-center py-8 sm:py-12">
          <div
            className={desktop ? "grid w-full grid-cols-2 items-center gap-12" : "flex w-full flex-col items-center"}
          >
            <div className={desktop ? '' : 'contents'}>
            <p className="font-mono text-sm font-bold uppercase tracking-normal text-zinc-500 sm:text-base">Ascend now with</p>
            <h1 className="mt-5 max-w-6xl text-center text-[3.6rem] font-semibold leading-[0.9] tracking-[-0.075em] text-black sm:text-[7rem] lg:text-[clamp(4rem,6vw,7rem)] lg:text-left">
              Mogging. Your face, in focus.
            </h1>
            <p className="mt-7 max-w-3xl text-center text-xl leading-8 text-zinc-500 sm:text-2xl sm:leading-9 lg:text-left">
              Explore your facial features with a comprehensive report, a detailed face map, and a personalized routine. Keep track of your photos and progress in the Mogging app.
            </p>
            <div className="mt-8">
              <EvaluationChoices showDesktopDownload track={destination => trackDestination(destination, 'hero')} />
            </div>
            </div>
            {desktop && <div className="min-h-0 self-stretch [contain:size]"><DesktopScanPreview /></div>}
          </div>

          <div data-landing-section="screenshots"
            className="mx-auto mt-16 w-full max-w-[var(--page-max)] sm:mt-20"
          >
            {desktop ? <div className="grid items-start gap-10 lg:grid-cols-2">
              <DesktopMemberPreview view="protocol" compact />
              <DesktopMemberPreview view="progress" compact />
            </div> : <div className="flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 sm:gap-6 lg:grid lg:grid-cols-3 lg:overflow-visible">
              {[EvaluationPreview, ProtocolPreview, ProgressPreview].map((Preview, index) => (
                <m.div {...entrance} key={index} className="w-[74vw] min-w-[260px] max-w-[340px] shrink-0 snap-start sm:w-[280px] lg:w-auto lg:min-w-0 lg:max-w-none"><Preview /></m.div>
              ))}
            </div>}

            <ReviewsSection />

            {!phone && <m.div {...entrance} data-landing-section="web_checkout" className="mx-auto mt-16 w-full max-w-5xl min-[1440px]:max-w-[var(--page-max)] sm:mt-20"><WebCheckout embedded showReport preview={preview} /></m.div>}
          </div>
        </section>
      </main>
  </LazyMotion>
}

function ReviewsSection() {
  const entrance = useHomepageEntrance()
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
    <m.section {...entrance} data-landing-section="reviews" aria-labelledby="reviews-title" className="mx-auto mt-16 w-full py-2 text-zinc-950 sm:mt-20">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4 px-1">
        <div>
          <h2 id="reviews-title" className="text-[1.7rem] font-semibold leading-none tracking-[-0.04em] sm:text-[2rem]">Reviews</h2>
        </div>
      </div>
      <div className="mb-9 grid gap-6 px-1 lg:grid-cols-[240px_1fr] lg:items-end">
        <div className="flex items-end gap-3">
          <span className="text-[5.6rem] font-semibold leading-[0.76] tracking-[-0.08em] text-zinc-500 sm:text-[6.5rem]">{averageRating}</span>
          <span className="pb-2 text-xl font-semibold text-zinc-500">out of 5</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-[120px_1fr] sm:items-end">
          <div className="text-lg font-semibold text-zinc-500 sm:text-right">438 reviews</div>
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
      <style jsx>{`
        .reviews-viewport {
          overflow-x: auto;
          scrollbar-width: none;
        }
        .reviews-viewport::-webkit-scrollbar { display: none; }
        .reviews-track {
          display: flex;
          width: max-content;
          animation: reviews-scroll 80s linear infinite;
          animation-play-state: paused;
        }
        .reviews-viewport[data-visible='true'] .reviews-track {
          animation-play-state: running;
        }
        .reviews-viewport:hover .reviews-track,
        .reviews-viewport:focus-within .reviews-track {
          animation-play-state: paused;
        }
        .reviews-viewport[data-paused='true'] .reviews-track {
          animation: none;
        }
        .reviews-group {
          display: flex;
          gap: 16px;
          padding-right: 16px;
        }
        .review-card {
          flex: 0 0 auto;
          width: clamp(280px, 80vw, 360px);
        }
        @keyframes reviews-scroll {
          to { transform: translateX(-50%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .reviews-track { animation: none; }
          .reviews-group[aria-hidden='true'] { display: none; }
        }
      `}</style>
    </m.section>
  )
}
