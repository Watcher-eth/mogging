import { useCallback, useEffect, useRef } from 'react'
import { ScanFace } from 'lucide-react'
import { SeoHead } from '@/components/app/seo-head'
import { flushWebAnalytics, setLandingAnalytics, trackWebEvent } from '@/lib/analytics/client'
import { landingProperties, type LandingAssignment } from '@/lib/analytics/landing'
import { homepageDestinationCookie } from '@/lib/homepage-routing'
import { appStoreUrl } from '@/lib/seo'

export function AppStoreHandoff({ assignment, onContinue }: { assignment: LandingAssignment; onContinue: () => void }) {
  const finished = useRef(false)
  const choose = useCallback((destination: 'web' | 'store', automatic = false) => {
    if (finished.current) return
    finished.current = true
    document.cookie = homepageDestinationCookie(destination, location.protocol === 'https:')
    setLandingAnalytics(assignment)
    const properties = { ...landingProperties(assignment), path: '/', surface: 'landing' }
    const eventProperties = { ...properties, destination: destination === 'store' ? 'app_store' : 'web', placement: automatic ? 'automatic_iphone' : 'iphone_handoff' }
    trackWebEvent('destination_selected', eventProperties)
    if (destination === 'store') {
      trackWebEvent('landing_viewed', properties)
      if (!automatic) trackWebEvent('landing_cta_clicked', eventProperties)
      trackWebEvent('app_store_redirected', eventProperties)
      void flushWebAnalytics()
      onContinue()
      location.assign(appStoreUrl)
    } else {
      void flushWebAnalytics()
      onContinue()
    }
  }, [assignment, onContinue])

  // Only count time while the page is visible; cancel when the visitor leaves.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') timer = setTimeout(() => choose('store', true), 4000)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule) }
  }, [choose])

  return <>
    <SeoHead title="Mogging" path="/" />
    <main className="grid min-h-[80svh] place-items-center bg-white px-6 py-12 text-zinc-950">
      <section aria-labelledby="app-handoff-title" className="w-full max-w-sm text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#e9f4ff] text-[#007aff]"><ScanFace aria-hidden="true" className="size-8" /></div>
        <h1 id="app-handoff-title" className="mt-6 text-3xl font-semibold tracking-tight">Your potential starts here.</h1>
        <p role="status" className="mt-3 text-sm leading-6 text-zinc-500">Taking you to Mogging on the App Store in a few seconds.</p>
        <a href={appStoreUrl} onClick={(event) => { event.preventDefault(); choose('store') }} className="mt-7 flex min-h-12 items-center justify-center rounded-full bg-[#007aff] px-6 text-sm font-semibold text-white active:bg-[#0064d1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007aff]">Open App Store</a>
        <button type="button" onClick={() => choose('web')} className="mt-3 min-h-12 px-5 text-sm text-zinc-600 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Continue on website</button>
      </section>
    </main>
  </>
}
