import { Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'
import { creatorGuideTopics, creatorGuideTopic, creatorGuideHref } from '@/lib/creator/guide-navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { signOut, useSession } from 'next-auth/react'
import useSWRImmutable from 'swr/immutable'
import { apiPost } from '@/lib/api/client'
import {
  Loader2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { MoreHorizontal, LogOut, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { CreatorAuthPrompt } from './creator-auth-prompt'
import { CreatorIcon, type CreatorIconName } from './creator-icon'
import { CreatorSetupChecklist } from './setup-checklist'
import { DiscordSupport } from './discord-support'

type CreatorNavItem = { href: string; label: string; asset: CreatorIconName }

const creatorNav: ReadonlyArray<CreatorNavItem> = [
  { href: '/creator', label: 'Overview', asset: 'overview' },
  { href: '/creator/sprints', label: 'Campaigns', asset: 'submissions' },
  { href: '/creator/submit', label: 'Submit', asset: 'video-submissions' },
  { href: '/creator/submissions', label: 'Submissions', asset: 'submissions' },
  { href: '/creator/accounts', label: 'Accounts', asset: 'accounts' },
  { href: '/creator/money', label: 'Money', asset: 'payouts' },
  { href: '/creator/cta-generator', label: 'CTA Studio', asset: 'cta' },
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
        <div className="flex items-center gap-2"><SidebarTrigger className="size-11" /><div className="shrink-0 px-1">
          <Link href="/creator" className="flex min-h-11 items-center gap-2.5 text-[13px] font-semibold tracking-[-0.015em] text-[#181a1d]"><Image src="/favicon.png" width={32} height={32} alt="" className="rounded-[9px]" priority /><span>Creator Studio</span></Link>

        </div></div>

        <button type="button" onClick={() => setMoreOpen(true)} aria-label="Creator menu" className="grid size-11 place-items-center rounded-full hover:bg-zinc-100"><MoreHorizontal className="size-5" /></button>
      </header>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}><DialogContent className="creator-dialog p-5"><DialogHeader className="text-left"><DialogTitle>Creator Studio</DialogTitle><DialogDescription>Account and support.</DialogDescription></DialogHeader><div className="flex items-center justify-between border-t pt-3 text-sm"><Link href="/support" onClick={() => setMoreOpen(false)} className="creator-button p-3">Support</Link><button className="flex min-h-11 items-center gap-2 px-3" onClick={() => void signOut({ callbackUrl: '/' })}><LogOut className="size-4" />Sign out</button></div></DialogContent></Dialog>
      <div className="creator-workspace flex min-w-0 flex-1">
        <CreatorNavigation />
        <SidebarInset className="creator-page creator-enter min-w-0 bg-white" key={router.pathname}>{children}</SidebarInset>
      </div>
      <CreatorSetupChecklist />
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

function CreatorNavigation() {
  const router = useRouter()
  const { setOpenMobile } = useSidebar()
  const inGuide = router.pathname === '/creator/guide'
  const topic = creatorGuideTopic(router.query.topic, router.asPath)

  return (
    <Sidebar collapsible="icon" className="creator-navigation">
      <SidebarHeader className="flex-row items-center justify-between border-b border-[#eceef0] p-4 md:hidden"><span className="text-sm font-semibold">Creator Studio</span><button type="button" aria-label="Close navigation" onClick={() => setOpenMobile(false)} className="grid size-10 place-items-center rounded-xl hover:bg-[#f7f8f9]"><X className="size-5" /></button></SidebarHeader>
      <SidebarContent className="pt-6">
        <SidebarGroup>
          <SidebarGroupLabel>Creator Studio</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu aria-label="Creator Studio navigation">
            {creatorNav.map((item) => <SidebarMenuItem key={item.href}><SidebarMenuButton asChild isActive={router.pathname === item.href} tooltip={item.label} className="creator-nav-link"><Link href={item.href} aria-label={item.label} aria-current={router.pathname === item.href ? 'page' : undefined} onClick={() => setOpenMobile(false)}><CreatorIcon name={item.asset} className="size-5" /><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Creator guide</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu aria-label="Guide topics">
            {creatorGuideTopics.map((item) => <SidebarMenuItem key={item.id}><SidebarMenuButton asChild isActive={inGuide && topic === item.id} tooltip={item.label} className="creator-guide-nav-link"><Link href={creatorGuideHref(item.id)} aria-label={item.label} aria-current={inGuide && topic === item.id ? 'page' : undefined} onClick={() => setOpenMobile(false)}><CreatorIcon name={item.icon} className="size-4" /><span>{item.label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}
          </SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter><SidebarMenu><SidebarMenuItem><DiscordSupport /></SidebarMenuItem></SidebarMenu></SidebarFooter>
    </Sidebar>
  )
}
