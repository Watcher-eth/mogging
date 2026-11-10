import Head from 'next/head'
import { useEffect, useLayoutEffect } from 'react'

const useViewportEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export function ScanPwaHead({ mobile, dark = false }: { mobile: boolean; dark?: boolean }) {
  useViewportEffect(() => {
    if (!mobile) return

    const viewport = window.visualViewport
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        // Pinching the page should magnify the layout, not resize it.
        if (viewport && viewport.scale !== 1) return
        document.documentElement.style.setProperty('--scan-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
      })
    }
    measure()
    viewport?.addEventListener('resize', measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', measure)
      window.removeEventListener('resize', measure)
      document.documentElement.style.removeProperty('--scan-viewport-height')
    }
  }, [mobile])

  useEffect(() => {
    if (mobile && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/scan/sw.js', { scope: '/' }).catch(() => {
        // The scan remains available in the browser when installation is unavailable.
      })
    }
  }, [mobile])

  return <Head>
    <link rel="manifest" href="/scan/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="Mogging.com" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="theme-color" content={dark ? "#030303" : "#ffffff"} />
    <meta name="viewport" key="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  </Head>
}
