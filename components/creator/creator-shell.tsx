import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import {
  BadgeCheck,
  BookOpenText,
  CircleDollarSign,
  Clapperboard,
  FileVideo2,
  LayoutDashboard,
  Loader2,
  Megaphone,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const creatorNav = [
  { href: '/creator', label: 'Overview', icon: LayoutDashboard },
  { href: '/creator/submit', label: 'Submit', icon: Clapperboard },
  { href: '/creator/submissions', label: 'Submissions', icon: FileVideo2 },
  { href: '/creator/accounts', label: 'Accounts', icon: BadgeCheck },
  { href: '/creator/payout-information', label: 'Payouts', icon: CircleDollarSign },
  { href: '/creator/cta-generator', label: 'CTA Studio', icon: Megaphone },
  { href: '/creator/guide', label: 'Guide', icon: BookOpenText },
]

export function CreatorShell({ children, allowUnauthenticated = false }: { children: ReactNode; allowUnauthenticated?: boolean }) {
  const router = useRouter()
  const { status } = useSession()

  if (status === 'loading') {
    return (
      <div className="creator-portal grid min-h-[55vh] place-items-center">
        <div className="flex items-center gap-2.5 text-sm font-medium text-[#6e6e73]">
          <Loader2 className="size-4 animate-spin" />
          Opening Creator Studio
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated' && !allowUnauthenticated) {
    return (
      <section className="creator-portal mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
        <span className="grid size-14 place-items-center rounded-[20px] bg-white text-[#0071e3] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_38px_rgba(0,0,0,0.08)]">
          <BadgeCheck className="size-6" />
        </span>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.14em] text-[#86868b]">Creator Studio</p>
        <h1 className="mt-2 text-[2rem] font-semibold leading-tight tracking-[-0.045em] text-[#1d1d1f]">Sign in to continue</h1>
        <p className="mt-3 max-w-md text-[15px] leading-6 text-[#6e6e73]">Use your Mogging account to submit videos, follow reviews, and manage payouts.</p>
        <Link href="/creator/accounts" className="creator-primary-button mt-7">Continue to Sign In</Link>
      </section>
    )
  }

  return (
    <div className="creator-portal w-full">
      <header className="creator-toolbar">
        <div className="shrink-0 px-1">
          <p className="text-[13px] font-semibold tracking-[-0.015em] text-[#1d1d1f]">Creator Studio</p>
          <p className="mt-0.5 text-[11px] text-[#86868b]">Create. Submit. Get paid.</p>
        </div>

        <nav className="creator-toolbar-nav" aria-label="Creator Studio navigation">
          {creatorNav.map((item) => {
            const active = router.pathname === item.href
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('creator-toolbar-item', active && 'creator-toolbar-item-active')}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="size-[15px]" strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </header>

      <main className="creator-page creator-enter" key={router.pathname}>{children}</main>
    </div>
  )
}

export function CreatorHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="creator-page-header">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#86868b]">{eyebrow}</p>
        <h1 className="mt-2 text-[2.25rem] font-semibold leading-[1.08] tracking-[-0.05em] text-[#1d1d1f] sm:text-[2.65rem]">{title}</h1>
        <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#6e6e73]">{description}</p>
      </div>
      {action ? <div className="creator-header-action">{action}</div> : null}
    </header>
  )
}

export const fieldClass = 'creator-field'
export const areaClass = 'creator-field min-h-28 resize-y py-3'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="flex items-center justify-between gap-4 text-[13px] font-semibold text-[#3a3a3c]">
        <span>{label}</span>
        {hint ? <span className="text-right text-[11px] font-normal leading-4 text-[#86868b]">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}
