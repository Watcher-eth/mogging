import { MoggingWordmark } from '@/components/brand/mogging-wordmark'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { AppNav } from './nav'

export function AppHeader({ children, activePath }: { children: ReactNode; activePath?: string }) {
  return <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl">
    <div className="grid h-16 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-5 sm:h-20 sm:grid-cols-[1fr_auto_1fr] sm:gap-4 sm:px-10">
      <Link href="/" className="text-xl font-semibold leading-none tracking-normal text-black transition-transform duration-200 ease-out hover:scale-[1.015] active:scale-[0.995] sm:text-4xl"><MoggingWordmark /></Link>
      <AppNav activePath={activePath} />
      <div className="flex justify-end">{children}</div>
    </div>
  </header>
}
