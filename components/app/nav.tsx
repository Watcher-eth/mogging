import { ChartNoAxesCombined, ListChecks, ScanFace, Swords, Trophy } from 'lucide-react'
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

const memberItems = [
  { href: '/protocol', label: 'Protocol', icon: ListChecks },
  { href: '/progress', label: 'Progress', icon: ChartNoAxesCombined },
] as const

export function AppNav({ activePath, member, newMemberFeatures }: { activePath?: string; member?: boolean; newMemberFeatures?: boolean }) {
  const router = useRouter()
  const { t } = useTranslation()

  return (
    <nav className="flex min-w-0 items-center justify-center gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] max-[480px]:gap-0 sm:gap-4 md:gap-6">
      {(member ? [...navItems, ...memberItems] : navItems).map((item) => {
        const isMemberItem = item.href === '/protocol' || item.href === '/progress'
        const label = isMemberItem ? item.label : t(item.label)
        const memberPreview = process.env.NODE_ENV === 'development' && router.pathname === '/__member-preview'
        const href = memberPreview && isMemberItem ? `/__member-preview?view=${item.href.slice(1)}` : item.href
        const currentPath = memberPreview ? (router.query.view === 'protocol' ? '/protocol' : '/progress') : router.pathname
        const active = (activePath ?? currentPath).startsWith(item.href)

        return (
          <Link
            key={item.href}
            href={href}
            aria-label={label}
            title={label}
            aria-current={active ? 'page' : undefined}
            prefetch={false}
            onClick={() => {
              if (router.pathname !== '/' || item.href !== '/analysis') return
              trackWebEvent('landing_cta_clicked', { surface: 'landing', path: '/', destination: 'web_analysis', placement: 'navigation' })
              void flushWebAnalytics()
            }}
            className={cn(
              'group relative flex h-10 w-7 shrink-0 items-center justify-center md:h-auto md:w-auto md:py-2 text-[11px] font-medium text-black/45 transition-[color,transform] duration-200 ease-out hover:-translate-y-0.5 hover:text-black active:scale-[0.98] sm:text-sm',
              active && 'text-black'
            )}
          >
            <item.icon className="size-[18px] md:hidden" aria-hidden="true" />
            <span className="hidden items-center gap-1.5 md:flex">{label}{isMemberItem && newMemberFeatures && <NewMemberPill />}</span>
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

export function NewMemberPill({ className }: { className?: string }) {
  return <span className={cn('rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-sky-800', className)}>New</span>
}
