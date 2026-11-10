import { LanguageSelect } from './language-select'
import { MoggingWordmark } from '@/components/brand/mogging-wordmark'
import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { AppNav } from './nav'
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'

export function AppHeader({ children, activePath, member, newMemberFeatures, desktopLanding }: { children: ReactNode; activePath?: string; member?: boolean; newMemberFeatures?: boolean; desktopLanding?: boolean }) {
  const isLanding = useRouter().pathname === '/'
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    if (!desktopLanding) return
    const sync = () => setScrolled(window.scrollY > 24)
    sync()
    window.addEventListener('scroll', sync, { passive: true })
    return () => window.removeEventListener('scroll', sync)
  }, [desktopLanding])

  const overHero = desktopLanding && !scrolled

  return <header className={cn("top-0 z-40", desktopLanding ? "fixed inset-x-0 transition-colors motion-reduce:transition-none" : "sticky", overHero ? "bg-gradient-to-b from-black/40 to-transparent" : isLanding && !desktopLanding ? "bg-white" : "bg-white/90 backdrop-blur-xl")}>
    <div className="public-frame public-gutters grid h-16 max-[480px]:px-3 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:h-20 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
      <Link href="/" className={cn("text-base min-[481px]:text-xl font-semibold leading-none tracking-normal transition-transform duration-200 ease-out hover:scale-[1.015] active:scale-[0.995] sm:text-4xl", overHero ? "text-white [text-shadow:0_1px_5px_#202b3980]" : "text-black")}><MoggingWordmark /></Link>
      <AppNav desktopLanding={desktopLanding} light={overHero} activePath={activePath} member={member} newMemberFeatures={newMemberFeatures} />
      <div className="col-start-3 flex items-center justify-end gap-1 sm:gap-2"><LanguageSelect />{children}</div>
    </div>
  </header>
}
