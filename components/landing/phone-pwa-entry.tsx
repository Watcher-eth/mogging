import { ScanPwaHead } from '@/components/app/scan-pwa-head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import { flushWebAnalytics, trackWebEvent } from '@/lib/analytics/client'
import { type LandingAssignment } from '@/lib/analytics/landing'
import { phoneViewportQuery } from '@/lib/analysis/phone-layout'
import { phonePwaEntryPath } from '@/lib/homepage-routing'

export function PhonePwaEntry({ assignment, preview }: { assignment?: LandingAssignment; preview?: boolean }) {
  const router = useRouter()
  const destination = phonePwaEntryPath(router.query)
  useEffect(() => {
    if (!router.isReady || !window.matchMedia(phoneViewportQuery).matches) return
    if (assignment && !preview) {
      const properties = { landing_id: null, experiment_id: null, variant: null, landing_version: null, path: '/', surface: 'landing', placement: 'automatic_mobile_web' }
      trackWebEvent('landing_viewed', properties)
      trackWebEvent('destination_selected', { ...properties, destination: 'web_analysis' })
      void flushWebAnalytics()
    }
    void router.replace(destination).catch(() => {})
  }, [assignment, destination, preview, router])

  return <main data-phone-pwa-entry="" className="grid min-h-dvh place-items-center bg-white">
    <ScanPwaHead mobile />
    <Link href={destination} className="text-sm font-medium text-zinc-700">Open Mogging</Link>
  </main>
}
