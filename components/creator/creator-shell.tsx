import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { BadgeCheck, Clapperboard, CreditCard, FileVideo, Loader2, Megaphone } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const creatorNav = [
  { href: '/creator/submit', label: 'Submit', icon: Clapperboard },
  { href: '/creator/submissions', label: 'Submissions', icon: FileVideo },
  { href: '/creator/accounts', label: 'Accounts', icon: BadgeCheck },
  { href: '/creator/payout-information', label: 'Payout Information', icon: CreditCard },
  { href: '/creator/cta-generator', label: 'CTA Generator', icon: Megaphone },
]

export function CreatorShell({ children, allowUnauthenticated = false }: { children: ReactNode; allowUnauthenticated?: boolean }) {
  const router = useRouter()
  const { status } = useSession()

  if (status === 'loading') {
    return <div className="grid min-h-[55vh] place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div>
  }
  if (status === 'unauthenticated' && !allowUnauthenticated) {
    return (
      <section className="mx-auto flex min-h-[55vh] max-w-xl flex-col items-center justify-center text-center">
        <span className="mb-5 grid size-12 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm"><BadgeCheck className="size-5" /></span>
        <h1 className="text-3xl font-semibold tracking-[-0.055em]">Creator access required</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-zinc-500">Sign in with your Mogging account to submit videos and track payments.</p>
        <Link href="/creator/accounts" className="mt-7 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition-transform duration-150 ease-out active:scale-[0.97]">Continue to accounts</Link>
      </section>
    )
  }

  return (
    <div className="creator-enter w-full">
      <div className="mb-8 flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Creator studio</p>
          <p className="mt-1.5 text-sm text-zinc-600">Create. Submit. Get paid.</p>
        </div>
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-[0_10px_35px_rgba(15,23,42,0.04)]">
          {creatorNav.map((item) => {
            const active = router.pathname === item.href
            const Icon = item.icon
            return (
              <Link key={item.href} href={item.href} className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition-[background-color,color,transform] duration-150 ease-out hover:bg-zinc-100 hover:text-black active:scale-[0.98] sm:text-sm', active && 'bg-black text-white hover:bg-black hover:text-white')}>
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="w-full min-w-0">{children}</div>
    </div>
  )
}

export function CreatorHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">{description}</p>
      </div>
      {action}
    </header>
  )
}

export const fieldClass = 'h-12 w-full rounded-xl border border-zinc-200 bg-white px-3.5 text-sm text-black shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100'
export const areaClass = 'min-h-28 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3.5 py-3 text-sm text-black shadow-[0_1px_2px_rgba(15,23,42,0.03)] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-4 focus:ring-zinc-100'

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="grid gap-2"><span className="flex items-center justify-between text-sm font-medium"><span>{label}</span>{hint ? <span className="text-xs font-normal text-zinc-400">{hint}</span> : null}</span>{children}</label>
}
