import { useEffect, useRef } from 'react'
import { setLandingAnalytics, trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'
import { landingProperties, type LandingAssignment } from '@/lib/analytics/landing'

export function useLandingTracking(assignment: LandingAssignment, preview: boolean) {
  const sections = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (preview) return
    setLandingAnalytics(assignment)
    let exposed = false
    const expose = () => {
      if (exposed || document.visibilityState !== 'visible') return
      exposed = true
      trackWebEvent('landing_viewed', { ...landingProperties(assignment), path: '/', surface: 'landing' })
    }
    expose()
    document.addEventListener('visibilitychange', expose)
    const seen = new Set<string>()
    const observer = new IntersectionObserver(entries => {
      if (!exposed || document.visibilityState !== 'visible') return
      for (const entry of entries) {
        const section = (entry.target as HTMLElement).dataset.landingSection
        if (!entry.isIntersecting || !section || seen.has(section)) continue
        seen.add(section)
        trackWebEvent('landing_section_viewed', { ...landingProperties(assignment), path: '/', surface: 'landing', placement: section })
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.25 })
    sections.current?.querySelectorAll('[data-landing-section]').forEach(section => observer.observe(section))
    return () => { document.removeEventListener('visibilitychange', expose); observer.disconnect() }
  }, [assignment, preview])
  function trackDestination(destination: 'app_store' | 'web_analysis', placement: string) {
    if (preview) return
    const properties = { ...landingProperties(assignment), path: '/', surface: 'landing', destination, placement }
    trackWebEvent('landing_cta_clicked', properties)
    if (destination === 'app_store') trackWebEvent('app_store_redirected', properties)
    void flushWebAnalytics()
  }
  return { sections, trackDestination }
}
