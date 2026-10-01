import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { signOut, useSession } from 'next-auth/react'
import useSWRImmutable from 'swr/immutable'
import { apiPost } from '@/lib/api/client'
import {
  Loader2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal, LogOut } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CreatorAuthPrompt } from './creator-auth-prompt'
import { CreatorIcon, type CreatorIconName } from './creator-icon'

type CreatorNavItem = { href: string; label: string; asset: CreatorIconName }

const creatorNav: ReadonlyArray<CreatorNavItem> = [
  { href: '/creator', label: 'Overview', asset: 'overview' },
  { href: '/creator/submit', label: 'Submit', asset: 'video-submissions' },
  { href: '/creator/submissions', label: 'Submissions', asset: 'submissions' },
  { href: '/creator/accounts', label: 'Accounts', asset: 'accounts' },
  { href: '/creator/payout-information', label: 'Payouts', asset: 'payouts' },
  { href: '/creator/cta-generator', label: 'CTA Studio', asset: 'cta' },
  { href: '/creator/guide', label: 'Guide', asset: 'guide' },
]

export function CreatorShell({ children, allowUnauthenticated = false }: { children: ReactNode; allowUnauthenticated?: boolean }) {
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const { data: session, status } = useSession()
  useSWRImmutable(
    status === 'authenticated' && session.user?.id ? ['/api/creator', session.user.id] : null,
    ([path]) => apiPost(path),
    { errorRetryCount: 3 },
  )
  const mobileNavRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = mobileNavRef.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && active) nav.scrollLeft = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.clientWidth) / 2
  }, [router.pathname, status])

  if (status === 'loading') {
    return (
      <div className="creator-portal grid min-h-[55vh] place-items-center">
        <div className="flex items-center gap-2.5 text-sm font-medium text-[#73777d]">
          <Loader2 className="size-4 animate-spin" />
          Opening Creator Studio
        </div>
      </div>
    )
  }

  if (status === 'unauthenticated' && allowUnauthenticated) return <>{children}</>

  if (status === 'unauthenticated') {
    return <CreatorAuthPrompt callbackUrl={router.asPath} />
  }

  if (router.pathname === '/creator/setup') return <>{children}</>

  return (
    <div className="creator-portal flex w-full flex-1 flex-col">
      <header className="creator-toolbar">
        <div className="shrink-0 px-1">
          <Link href="/creator" className="flex min-h-11 items-center gap-2.5 text-[13px] font-semibold tracking-[-0.015em] text-[#181a1d]"><Image src="/favicon.png" width={32} height={32} alt="" className="rounded-[9px]" priority /><span>Creator Studio</span></Link>

        </div>

        <button type="button" onClick={() => setMoreOpen(true)} aria-label="Creator menu" className="grid size-11 place-items-center rounded-full hover:bg-zinc-100"><MoreHorizontal className="size-5" /></button>
      </header>

      <nav ref={mobileNavRef} aria-label="Mobile creator navigation" className="creator-bottom-nav">
        {creatorNav.map((item) => <Link key={item.href} href={item.href} aria-current={router.pathname === item.href ? 'page' : undefined} className={cn('creator-toolbar-item', router.pathname === item.href && 'creator-toolbar-item-active')}><CreatorIcon name={item.asset} className="size-[22px]" /><span>{item.label}</span></Link>)}
      </nav>
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent className="creator-dialog p-5"><DialogHeader className="text-left"><DialogTitle>Creator Studio</DialogTitle><DialogDescription>Account and support.</DialogDescription></DialogHeader><div className="flex items-center justify-between border-t pt-3 text-sm"><Link href="/support" onClick={() => setMoreOpen(false)} className="p-3">Support</Link><button className="flex min-h-11 items-center gap-2 px-3" onClick={() => void signOut({ callbackUrl: '/' })}><LogOut className="size-4" />Sign out</button></div></DialogContent></Dialog>
      <div className="creator-workspace flex-1">
        <nav className="creator-sidebar hidden md:flex" aria-label="Creator Studio navigation">
          {creatorNav.map((item) => {
            const active = router.pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('creator-toolbar-item', active && 'creator-toolbar-item-active')}
                aria-current={active ? 'page' : undefined}
              >
                <CreatorIcon name={item.asset} className="size-[22px]" />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
        <main className="creator-page creator-enter" key={router.pathname}>{children}</main>
      </div>
    </div>
  )
}

export function CreatorHeader({ eyebrow, title, description, action, titleAccessory }: { eyebrow: string; title: string; description: string; action?: ReactNode; titleAccessory?: ReactNode }) {
  return (
    <header className="creator-page-header">
      <div className={cn("min-w-0", titleAccessory && "flex-1")}>
        <p className="hidden text-[11px] font-semibold uppercase sm:block tracking-[0.13em] text-[#858a91]">{eyebrow}</p>
        <div className="mt-2 flex items-center justify-between gap-3"><h1 className="text-[1.75rem] font-medium leading-[1.15] tracking-[-0.035em] text-[#181a1d] sm:text-[2.25rem]">{title}</h1>{titleAccessory}</div>
        <p className="mt-0.5 max-w-2xl text-sm leading-5 sm:text-[15px] sm:leading-6 text-[#73777d]">{description}</p>
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
        {hint ? <span className="text-right text-[11px] font-normal leading-4 text-[#858a91]">{hint}</span> : null}
      </span>
      {children}
    </label>
  )
}
