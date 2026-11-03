import { ScanFace, Trophy, Swords } from 'lucide-react'
import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { LazyMotion } from 'motion/react'
import * as m from 'motion/react-m'
const loadNavMotion = () => import('motion/react').then(module => module.domMax)
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/analysis', label: 'nav.analysis', icon: ScanFace },
  { href: '/leaderboard', label: 'nav.leaderboard', icon: Trophy },
  { href: '/battle', label: 'nav.battle', icon: Swords },
] as const

export function AppNav({ activePath }: { activePath?: string }) {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <nav className="flex min-w-0 items-center justify-center gap-2 max-[360px]:col-span-3 max-[360px]:row-start-2 max-[360px]:gap-6 sm:gap-8">
      {navItems.map((item) => {
        const active = (activePath ?? router.pathname).startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-label={t(item.label)}
            title={t(item.label)}
            prefetch={router.pathname !== '/'}
            onClick={() => {
              if (router.pathname !== '/' || item.href !== '/analysis') return
              trackWebEvent('landing_cta_clicked', { surface: 'landing', path: '/', destination: 'web_analysis', placement: 'navigation' })
              void flushWebAnalytics()
            }}
            className={cn(
              'group relative flex h-9 w-8 shrink-0 items-center justify-center min-[481px]:h-auto min-[481px]:w-auto min-[481px]:py-2 text-[11px] font-medium text-black/45 transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:text-black active:scale-[0.98] sm:text-sm',
              active && 'text-black'
            )}
          >
            <item.icon className="size-[18px] min-[481px]:hidden" aria-hidden="true" />
            <span className="block max-[480px]:hidden">{t(item.label)}</span>
            {active ? (
              <LazyMotion features={loadNavMotion}><m.span
                layoutId="app-nav-active-pill"
                className="absolute inset-x-0 bottom-0.5 mx-auto h-0.5 w-5 rounded-full border border-zinc-300 bg-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] sm:h-1 sm:w-7"
                transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.7 }}
                aria-hidden="true"
              /></LazyMotion>
            ) : (
              <span
                className="absolute inset-x-0 bottom-0.5 mx-auto h-0.5 w-5 origin-center scale-x-0 rounded-full border border-zinc-300 bg-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)] transition-transform duration-200 ease-out group-hover:scale-x-100 sm:h-1 sm:w-7"
                aria-hidden="true"
              />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
