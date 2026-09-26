import Link from 'next/link'
import { useRouter } from 'next/router'
import { signOut, useSession } from 'next-auth/react'
import {
  LayoutDashboard,
  Loader2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MoreHorizontal, LogOut } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CreatorAuthSurface } from './creator-auth-surface'
import { CreatorIcon, type CreatorIconName } from './creator-icon'

type CreatorNavItem = { href: string; label: string; icon?: typeof LayoutDashboard; asset?: CreatorIconName }

const creatorNav: ReadonlyArray<CreatorNavItem> = [
  { href: '/creator', label: 'Overview', icon: LayoutDashboard },
  { href: '/creator/submit', label: 'Submit', asset: 'video-submissions' },
  { href: '/creator/submissions', label: 'Submissions', asset: 'video-submissions' },
  { href: '/creator/accounts', label: 'Accounts', asset: 'accounts' },
  { href: '/creator/payout-information', label: 'Payouts', asset: 'payouts' },
  { href: '/creator/cta-generator', label: 'CTA Studio', asset: 'cta' },
  { href: '/creator/guide', label: 'Guide', asset: 'guide' },
]

function CreatorNavIcon({ item, className, active = false }: { item: CreatorNavItem; className: string; active?: boolean }) {
  if (item.asset) return <CreatorIcon name={item.asset} className={className} />
  const Icon = item.icon
  return Icon ? <Icon className={className} strokeWidth={active ? 2.25 : 1.8} aria-hidden="true" /> : null
}

export function CreatorShell({ children, allowUnauthenticated = false }: { children: ReactNode; allowUnauthenticated?: boolean }) {
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
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

  if (status === 'unauthenticated' && allowUnauthenticated) return <>{children}</>

  if (status === 'unauthenticated') {
    return (
      <CreatorAuthSurface>
        <Link href="/creator/accounts" className="creator-primary-button gap-2">Sign in<span aria-hidden="true">↗</span></Link>
      </CreatorAuthSurface>
    )
  }

  return (
    <div className="creator-portal w-full">
      <header className="creator-toolbar">
        <div className="shrink-0 px-1">
          <p className="text-[13px] font-semibold tracking-[-0.015em] text-[#1d1d1f]"><Link href="/creator">Mogging <span className="font-normal text-zinc-500">/ Creator Studio</span></Link></p>

        </div>

        <nav className="creator-toolbar-nav hidden md:flex" aria-label="Creator Studio navigation">
          {creatorNav.map((item) => {
            const active = router.pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('creator-toolbar-item', active && 'creator-toolbar-item-active')}
                aria-current={active ? 'page' : undefined}
              >
                <CreatorNavIcon item={item} className="size-[22px]" active={active} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <button type="button" onClick={() => setMoreOpen(true)} aria-label="Creator menu" className="grid size-11 place-items-center rounded-full hover:bg-zinc-100"><MoreHorizontal className="size-5" /></button>
      </header>

      <nav aria-label="Mobile creator navigation" className="creator-bottom-nav">
        {creatorNav.slice(0, 3).map((item) => <Link key={item.href} href={item.href} aria-current={router.pathname === item.href ? 'page' : undefined} className={cn('grid min-h-14 place-content-center justify-items-center gap-1 text-xs', router.pathname === item.href ? 'font-semibold text-[#0071e3]' : 'text-zinc-600')}><CreatorNavIcon item={item} className="size-6" active={router.pathname === item.href} />{item.label === 'Overview' ? 'Home' : item.label}</Link>)}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" className={cn('grid min-h-14 place-content-center justify-items-center gap-1 text-xs', creatorNav.slice(3).some((item) => item.href === router.pathname) ? 'font-semibold text-[#0071e3]' : 'text-zinc-600')}><MoreHorizontal className="size-5" />More</button>
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent className="creator-dialog p-5"><DialogHeader className="text-left"><DialogTitle>Creator Studio</DialogTitle><DialogDescription>Tools, accounts, and help.</DialogDescription></DialogHeader><nav aria-label="More creator pages" className="grid gap-1">{creatorNav.slice(3).map((item) => <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)} aria-current={router.pathname === item.href ? 'page' : undefined} className={cn('flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm', router.pathname === item.href ? 'bg-blue-50 font-semibold text-blue-700' : 'hover:bg-zinc-50')}><CreatorNavIcon item={item} className="size-8" active={router.pathname === item.href} />{item.label}</Link>)}</nav><div className="flex items-center justify-between border-t pt-3 text-sm"><Link href="/support" onClick={() => setMoreOpen(false)} className="p-3">Support</Link><button className="flex min-h-11 items-center gap-2 px-3" onClick={() => void signOut({ callbackUrl: '/' })}><LogOut className="size-4" />Sign out</button></div></DialogContent></Dialog>
      <main className="creator-page creator-enter" key={router.pathname}>{children}</main>
    </div>
  )
}

export function CreatorHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="creator-page-header">
      <div className="min-w-0">
        <p className="hidden text-[11px] font-semibold uppercase sm:block tracking-[0.13em] text-[#86868b]">{eyebrow}</p>
        <h1 className="mt-2 text-[1.75rem] font-semibold leading-[1.08] tracking-[-0.05em] text-[#1d1d1f] sm:text-[2.65rem]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-5 sm:text-[15px] sm:leading-6 text-[#6e6e73]">{description}</p>
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
