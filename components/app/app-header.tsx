import { LanguageSelect } from './language-select'
import { MoggingWordmark } from '@/components/brand/mogging-wordmark'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AppNav } from './nav'
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'

export function AppHeader({ children, activePath }: { children: ReactNode; activePath?: string }) {
  const isLanding = useRouter().pathname === '/'
  return <header className={cn("sticky top-0 z-40", isLanding ? "bg-white" : "bg-white/90 backdrop-blur-xl")}>
    <div className={cn("grid h-16 max-[360px]:h-auto max-[360px]:gap-y-1 max-[360px]:py-2 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-5 sm:h-20 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-10", isLanding && "mx-auto max-w-6xl px-6")}>
      <Link href="/" className="text-lg min-[481px]:text-xl font-semibold leading-none tracking-normal text-black transition-transform duration-200 ease-out hover:scale-[1.015] active:scale-[0.995] sm:text-4xl"><MoggingWordmark /></Link>
      <AppNav activePath={activePath} />
      <div className="col-start-3 flex items-center justify-end gap-1 sm:gap-2"><LanguageSelect />{children}</div>
    </div>
  </header>
}
