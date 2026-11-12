import { usePhoneLayout } from '@/hooks/use-phone-layout'
import Link from 'next/link'
import { ScanFace } from '@/components/ui/mogging-glyphs'
import { useTranslation } from 'react-i18next'
import { appStoreUrl } from '@/lib/seo'
import { useEffect, useState, type RefObject } from 'react'

const pill = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-3 py-2 text-center text-xs font-semibold transition-[background-color,transform] active:scale-[0.98] motion-reduce:transform-none sm:px-5 sm:text-sm'
const primaryPill = 'bg-zinc-950 px-5 text-white hover:bg-zinc-800'
const secondaryPill = 'border border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-100'
const scanPill = `${pill} ${primaryPill}`

export function EvaluationChoices({ track, webHref, storeHref = appStoreUrl, showDesktopDownload = false, showPhoneDownload = true, preferAppStore = false }: {
  track?: (destination: 'app_store' | 'web_analysis') => void
  webHref?: string
  storeHref?: string
  showDesktopDownload?: boolean
  showPhoneDownload?: boolean
  preferAppStore?: boolean
}) {
  const { t } = useTranslation()
  const desktop = !usePhoneLayout(true)
  const storeFirst = !desktop && showPhoneDownload && preferAppStore
  const store = (desktop ? showDesktopDownload : showPhoneDownload) ? (
    <a href={storeHref} onClick={() => track?.('app_store')}
      className={`${pill} ${storeFirst ? primaryPill : desktop ? 'text-zinc-600 hover:bg-zinc-100' : secondaryPill}`}>
      <AppleMark />{desktop ? t('landing.download') : 'Get the iPhone app'}
    </a>
  ) : null
  return <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 whitespace-nowrap sm:gap-3">
    {storeFirst && store}
    <Link href={webHref ?? '/analysis'} prefetch={false} onClick={() => track?.('web_analysis')}
      className={`${pill} ${storeFirst ? secondaryPill : primaryPill} ${desktop ? 'min-w-36' : ''}`}>
      <ScanFace className="size-4 shrink-0" aria-hidden="true" />{desktop ? 'Start now' : storeFirst ? 'Scan on web' : 'Start my face scan'}
    </Link>
    {!storeFirst && store}
  </div>
}

export function StickyMobileScan({ hero, onStart, onDownload }: {
  hero: RefObject<HTMLElement | null>; onStart: () => void; onDownload?: () => void
}) {
  const phone = usePhoneLayout(false)
  const [pastHero, setPastHero] = useState(false)
  useEffect(() => {
    const element = hero.current
    if (!phone || !element) return
    const observer = new IntersectionObserver(([entry]) => {
      setPastHero(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hero, phone])
  if (!phone || !pastHero) return null
  return <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-white/95 via-white/75 to-transparent px-4 pt-6 pb-[calc(env(safe-area-inset-bottom)+12px)]">
    {onDownload ? <div className="pointer-events-auto">
      <EvaluationChoices preferAppStore track={destination => destination === 'app_store' ? onDownload() : onStart()} />
    </div> : <Link href="/analysis" prefetch={false} onClick={onStart} className={`${scanPill} pointer-events-auto min-h-12 w-full max-w-xs text-sm shadow-lg shadow-black/15`}>
      <ScanFace className="size-4 shrink-0" aria-hidden="true" />Start my face scan
    </Link>}
  </div>
}

function AppleMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-4 shrink-0"
      aria-hidden="true"
    >
      <path d="M17.05 12.54c.03 3.12 2.74 4.16 2.77 4.17-.02.07-.43 1.48-1.42 2.93-.86 1.25-1.76 2.5-3.16 2.53-1.38.03-1.82-.82-3.4-.82-1.58 0-2.07.8-3.38.85-1.35.05-2.38-1.36-3.24-2.61-1.77-2.56-3.12-7.24-1.3-10.4A5.04 5.04 0 0 1 8.18 6.6c1.34-.03 2.6.9 3.4.9.79 0 2.28-1.11 3.84-.95.65.03 2.5.26 3.7 2.02-.1.07-2.21 1.29-2.07 3.97ZM14.5 4.88c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.24 1.98-1.08 3.14 1.14.09 2.3-.58 3.01-1.43Z" />
    </svg>
  );
}
