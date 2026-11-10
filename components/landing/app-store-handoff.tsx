import { useCallback, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { LazyMotion, domAnimation } from 'motion/react'
import { SeoHead } from '@/components/app/seo-head'
import { flushWebAnalytics, setLandingAnalytics, trackWebEvent } from '@/lib/analytics/client'
import { landingProperties, type LandingAssignment } from '@/lib/analytics/landing'
import { homepageDestinationCookie } from '@/lib/homepage-routing'
import { appStoreUrl } from '@/lib/seo'
import { useLandingTracking } from './use-landing-tracking'
import styles from './app-store-handoff.module.css'

const ScanReportPreview = dynamic(() => import('./mobile-preview').then(module => module.ScanReportPreview))

const analysisEntry = '/analysis?start=1'
const storeAttemptKey = 'mogging.handoff.store-attempted'

export function AppStoreHandoff({ assignment, autoRedirect = true, destination = 'store' }: { assignment: LandingAssignment; autoRedirect?: boolean; destination?: 'web' | 'store' }) {
  const router = useRouter()
  const leavingForWeb = useRef(false)
  const storeAttempted = useRef(false)
  useLandingTracking(assignment, !autoRedirect)
  const choose = useCallback((target: 'web' | 'store', placement = 'iphone_handoff'): void => {
    if (leavingForWeb.current) return
    const automatic = placement !== 'iphone_handoff'
    setLandingAnalytics(assignment)
    const properties = { ...landingProperties(assignment), path: '/', surface: 'landing', destination: target === 'store' ? 'app_store' : 'web_analysis', placement }
    trackWebEvent('destination_selected', properties)
    if (!automatic) trackWebEvent('landing_cta_clicked', properties)
    if (target === 'store') {
      storeAttempted.current = true
      try { sessionStorage.setItem(storeAttemptKey, '1') } catch {}
      trackWebEvent('app_store_redirected', properties)
      void flushWebAnalytics()
      try { location.assign(appStoreUrl) } catch { choose('web', 'store_fallback') }
      return
    }
    if (!automatic) document.cookie = homepageDestinationCookie('web', location.protocol === 'https:')
    leavingForWeb.current = true
    if (storeAttempted.current) window.stop()
    void flushWebAnalytics()
    void router.push(analysisEntry).then(navigated => {
      if (!navigated) location.assign(analysisEntry)
    }).catch(() => location.assign(analysisEntry))
  }, [assignment, router])

  useEffect(() => {
    if (!autoRedirect) return
    if (destination === 'web') {
      choose('web', 'automatic_mobile_web')
      return
    }
    let attempted = false
    try { attempted = sessionStorage.getItem(storeAttemptKey) === '1' } catch {}
    if (attempted) {
      choose('web', 'store_return')
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let fallback: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      clearTimeout(timer)
      clearTimeout(fallback)
      if (attempted || storeAttempted.current || document.visibilityState !== 'visible') return
      timer = setTimeout(() => {
        if (storeAttempted.current) return
        attempted = true
        choose('store', 'automatic_iphone')
        fallback = setTimeout(() => {
          if (document.visibilityState === 'visible') choose('web', 'store_fallback')
        }, 2400)
      }, 4000)
    }
    schedule()
    document.addEventListener('visibilitychange', schedule)
    return () => {
      clearTimeout(timer)
      clearTimeout(fallback)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [autoRedirect, choose, destination])

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
