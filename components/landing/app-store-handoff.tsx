import { useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { LazyMotion, domAnimation } from 'motion/react'
import { SeoHead } from '@/components/app/seo-head'
import { flushWebAnalytics, setLandingAnalytics, trackWebEvent } from '@/lib/analytics/client'
import { landingProperties, type LandingAssignment } from '@/lib/analytics/landing'
import { homepageDestinationCookie } from '@/lib/homepage-routing'
import { appStoreUrl } from '@/lib/seo'
import styles from './app-store-handoff.module.css'

const ScanReportPreview = dynamic(() => import('./mobile-preview').then(module => module.ScanReportPreview))

export function AppStoreHandoff({ assignment, autoRedirect = true }: { assignment: LandingAssignment; autoRedirect?: boolean }) {
  const router = useRouter()
  const finished = useRef(false)
  const choose = useCallback((destination: 'web' | 'store', automatic = false) => {
    if (finished.current) return
    finished.current = true
    document.cookie = homepageDestinationCookie(destination, location.protocol === 'https:')
    setLandingAnalytics(assignment)
    const properties = { ...landingProperties(assignment), path: '/', surface: 'landing' }
    const eventProperties = { ...properties, destination: destination === 'store' ? 'app_store' : 'web_analysis', placement: automatic ? 'automatic_iphone' : 'iphone_handoff' }
    trackWebEvent('destination_selected', eventProperties)
    if (!automatic) trackWebEvent('landing_cta_clicked', eventProperties)
    if (destination === 'store') {
      trackWebEvent('app_store_redirected', eventProperties)
      void flushWebAnalytics()
      location.assign(appStoreUrl)
    } else {
      void flushWebAnalytics()
      void router.push('/analysis')
    }
  }, [assignment, router])

  // Only count time while the page is visible; cancel when the visitor leaves.
  useEffect(() => {
    if (!autoRedirect) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      if (document.visibilityState === 'visible') timer = setTimeout(() => choose('store', true), 4000)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', schedule) }
  }, [autoRedirect, choose])

  return <>
    <SeoHead title="Mogging" path="/" />
    <main aria-labelledby="app-handoff-title" className={styles.screen}>
      <h1 id="app-handoff-title" className={styles.title}>Understand your face and unlock your true potential</h1>
      <div className={styles.previewArea}>
        <div className={styles.preview}><LazyMotion features={domAnimation}><ScanReportPreview /></LazyMotion></div>
      </div>
      <div className={styles.actions}>
        <a href={appStoreUrl} onClick={(event) => { event.preventDefault(); choose('store') }} className={styles.store}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 shrink-0">
            <path d="m8 3 9 16M16 3 7 19M4 15h12M18 15h2M5 19l-1 2M18 21l-1-2" />
          </svg>
          Open App Store
        </a>
        <button type="button" onClick={() => choose('web')} className={styles.continue}>Get your Report now</button>
      </div>
    </main>
  </>
}
