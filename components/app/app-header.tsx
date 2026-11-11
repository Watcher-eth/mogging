import { LanguageSelect } from './language-select'
import { MoggingWordmark } from '@/components/brand/mogging-wordmark'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppNav } from './nav'
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'
import { ProgressiveBlur } from '@/components/courses/progressive-blur'
import styles from './app-header.module.css'

export function AppHeader({ children, activePath, member, newMemberFeatures, desktopLanding }: { children: ReactNode; activePath?: string; member?: boolean; newMemberFeatures?: boolean; desktopLanding?: boolean }) {
  const isLanding = useRouter().pathname === '/'
  const header = useRef<HTMLElement>(null)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!desktopLanding) return
    const sync = () => {
      const progress = Math.min(1, Math.max(0, (window.scrollY - 8) / 78))
      const eased = progress * progress * (3 - 2 * progress)
      header.current?.style.setProperty('--header-scroll', String(eased))
      setScrolled(progress >= .46)
    }
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [desktopLanding])

  const overHero = desktopLanding && !scrolled

  return <header ref={header} className={cn("top-0 z-40", desktopLanding ? "fixed inset-x-0" : isLanding ? "sticky bg-white" : "sticky bg-white/90 backdrop-blur-xl")}>
    {desktopLanding && <>
      <ProgressiveBlur direction="top" intensity={13} blurLayers={3} className={styles.scrollBlur} />
      <div aria-hidden="true" className={styles.scrollTint} />
      <div aria-hidden="true" className={styles.heroScrim} />
    </>}
    <div className="public-frame public-gutters relative grid h-16 max-[480px]:px-3 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:h-20 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
      <Link href="/" className={cn("text-base min-[481px]:text-xl font-semibold leading-none tracking-normal transition-[color,transform] duration-200 ease-out hover:scale-[1.015] active:scale-[0.995] sm:text-4xl", overHero ? "text-white [text-shadow:0_1px_5px_#202b3980]" : "text-black")}><MoggingWordmark /></Link>
      <AppNav desktopLanding={desktopLanding} light={overHero} activePath={activePath} member={member} newMemberFeatures={newMemberFeatures} />
      <div className="col-start-3 flex items-center justify-end gap-1 sm:gap-2"><LanguageSelect />{children}</div>
    </div>
  </header>
}
