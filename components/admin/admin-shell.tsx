import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useState, type ReactNode } from 'react'
import useSWR, { useSWRConfig } from 'swr'
import { ArrowUpRight, LockKeyhole, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { CreatorIcon } from '@/components/creator/creator-icon'
import { adminNavigation, adminPage } from '@/lib/admin/navigation'
import { apiGet, apiRequest } from '@/lib/api/client'
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarGroup, SidebarGroupLabel, SidebarGroupContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset, SidebarTrigger, useSidebar } from '@/components/ui/sidebar'

export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const page = adminPage(router.pathname)
  const sessionPath = router.pathname === '/admin/invites' ? '/api/admin/invites/session' : '/api/admin/creator/session'
  const access = useSWR<{ unlocked: boolean }>(sessionPath, apiGet, { shouldRetryOnError: false })
  const { mutate } = useSWRConfig()
  const [locking, setLocking] = useState(false)
  async function lock() {
    setLocking(true)
    try {
      await apiRequest(sessionPath, { method: 'DELETE' })
      await mutate(key => typeof key === 'string' && key.startsWith('/api/admin/'), undefined, { revalidate: true })
    } catch { toast.error('Could not lock the workspace. Please retry.') }
    finally { setLocking(false) }
  }
  return <SidebarProvider className="creator-app creator-portal admin-portal min-h-dvh flex-col">
    <Head><title>{`${page?.title || 'Admin'} · Mogging`}</title><meta name="robots" content="noindex,nofollow" /></Head>
    <a href="#admin-content" className="admin-skip-link">Skip to content</a>
    <header className="creator-toolbar admin-toolbar">
      <div className="flex items-center gap-2"><SidebarTrigger className="size-11" /><Link href="/admin/creators" className="flex items-center gap-2.5 text-sm font-semibold"><Image src="/favicon.png" width={30} height={30} alt="" className="rounded-lg" priority /><span>Mogging <span className="ml-1 font-normal text-[#858a91]">Admin</span></span></Link></div>
      <div className="flex items-center gap-4"><span className="hidden items-center gap-1.5 text-xs text-[#73777d] sm:flex"><span className="size-1.5 rounded-full bg-[#00A8EF]" />Private workspace</span>{access.data?.unlocked ? <button className="admin-lock" onClick={() => void lock()} disabled={locking}>{locking ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}<span>Lock</span></button> : null}</div>
    </header>
    <div className="flex min-w-0 flex-1"><AdminNavigation /><SidebarInset id="admin-content" tabIndex={-1} className="admin-page min-w-0 bg-white">{children}</SidebarInset></div>
  </SidebarProvider>
}

function AdminNavigation() {
  const router = useRouter()
  const { setOpenMobile } = useSidebar()
  return <Sidebar collapsible="icon" className="creator-navigation admin-navigation">
    <SidebarHeader className="flex-row items-center justify-between border-b border-[#eceef0] p-3 md:hidden"><span className="text-sm font-semibold">Mogging Admin</span><button aria-label="Close navigation" onClick={() => setOpenMobile(false)} className="grid size-11 place-items-center"><X className="size-5" /></button></SidebarHeader>
    <SidebarContent className="py-4"><nav aria-label="Admin navigation">{adminNavigation.map(group => <SidebarGroup key={group.label}><SidebarGroupLabel>{group.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{group.items.map(item => <SidebarMenuItem key={item.href}><SidebarMenuButton asChild tooltip={item.title} isActive={router.pathname === item.href} className="creator-nav-link"><Link href={item.href} onClick={() => setOpenMobile(false)} aria-label={item.title} aria-current={router.pathname === item.href ? 'page' : undefined}><CreatorIcon name={item.icon} className="size-5" /><span>{item.title}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}</nav></SidebarContent>
    <SidebarFooter><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip="Creator portal" className="creator-guide-nav-link"><Link href="/creator"><ArrowUpRight className="size-4" /><span>Creator portal</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarFooter>
  </Sidebar>
}
