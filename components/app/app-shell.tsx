import Link from 'next/link'
import type { ReactNode } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/router'
import { AppNav } from '@/components/app/nav'
import { Button } from '@/components/ui/button'

type AppShellProps = {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const immersive = router.pathname === '/' || router.pathname === '/analysis'

  return (
    <div className={immersive ? 'min-h-screen bg-white' : 'min-h-screen bg-background'}>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl">
        <div className="grid h-20 w-full grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 sm:px-10">
          <Link href="/" className="text-3xl font-semibold leading-none tracking-[-0.06em] text-black sm:text-4xl">
            Mogging
          </Link>

          <AppNav />

          <div className="flex justify-end">
            {status === 'loading' ? (
              <div className="h-10 w-24 animate-pulse rounded-lg border border-zinc-200 bg-white" />
            ) : session?.user ? (
              <Button
                className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-medium text-black shadow-none hover:bg-zinc-50"
                variant="outline"
                size="sm"
                onClick={() => signOut({ callbackUrl: '/' })}
              >
                <span className="grid size-6 place-items-center rounded-full bg-zinc-100 text-[11px] uppercase text-black/70">
                  {session.user.name?.slice(0, 1) || session.user.email?.slice(0, 1) || 'U'}
                </span>
                <span className="hidden max-w-28 truncate sm:inline">
                  {session.user.name || session.user.email || 'Profile'}
                </span>
              </Button>
            ) : (
              <Button asChild className="h-10 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-medium text-black shadow-none hover:bg-zinc-50" variant="outline" size="sm">
                <Link href="/auth/login">Login</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className={immersive ? 'w-full' : 'mx-auto w-full max-w-6xl px-4 py-8 sm:px-6'}>
        {children}
      </main>
    </div>
  )
}
