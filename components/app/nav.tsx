import { trackWebEvent, flushWebAnalytics } from '@/lib/analytics/client'
import Link from 'next/link'
import { LazyMotion } from 'motion/react'
import * as m from 'motion/react-m'
const loadNavMotion = () => import('motion/react').then(module => module.domMax)
import { useRouter } from 'next/router'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/analysis', label: 'Analysis' },
  { href: '/leaderboard', label: 'Leaderboard' },
  { href: '/battle', label: 'Battle' },
]

export function AppNav({ activePath }: { activePath?: string }) {
  const router = useRouter()

  return (
    <nav className="flex min-w-0 items-center justify-center gap-2 sm:gap-8">
      {navItems.map((item) => {
        const active = (activePath ?? router.pathname).startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={router.pathname !== '/'}
            onClick={() => {
              if (router.pathname !== '/' || item.href !== '/analysis') return
              trackWebEvent('landing_cta_clicked', { surface: 'landing', path: '/', destination: 'web_analysis', placement: 'navigation' })
              void flushWebAnalytics()
            }}
            className={cn(
              'group relative py-2 text-[11px] font-medium text-black/45 transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:text-black active:scale-[0.98] sm:text-sm',
              active && 'text-black'
            )}
          >
            <span>{item.label}</span>
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
