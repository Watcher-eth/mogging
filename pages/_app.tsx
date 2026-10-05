import type { AppProps } from 'next/app'
import { useRouter } from 'next/router'
import { useState, type ReactNode } from 'react'
import { SessionProvider } from 'next-auth/react'
import { SWRConfig } from 'swr'
import { Toaster } from 'sonner'
import { CircleCheck, CircleAlert } from 'lucide-react'
import { AppShell } from '@/components/app/app-shell'
import { SeoHead } from '@/components/app/seo-head'
import { swrConfig } from '@/lib/swr'
import '@/styles/globals.css'
import '@/styles/courses.css'
import '@/styles/admin.css'
import dynamic from 'next/dynamic'
const SoundProvider = dynamic(() => import('@web-kits/audio/react').then(module => module.SoundProvider))

function PageSound({ silent, children, ...props }: { silent: boolean; children: ReactNode; enabled: boolean; volume: number; onEnabledChange: (enabled: boolean) => void; onVolumeChange: (volume: number) => void }) {
  return silent ? <>{children}</> : <SoundProvider {...props}>{children}</SoundProvider>
}

const AdminShell = dynamic(() => import('@/components/admin/admin-shell').then(module => module.AdminShell))
const Analytics = dynamic(() => import('@/components/app/analytics').then(module => module.Analytics), { ssr: false })

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const router = useRouter()
  const courseRoute = router.pathname === '/courses'
    || router.pathname.startsWith('/courses/')
    || router.pathname === '/creator/courses'
    || router.pathname.startsWith('/creator/courses/')
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundVolume, setSoundVolume] = useState(0.82)

  return (
    <SessionProvider session={session}>
      <Analytics />
      <SWRConfig value={swrConfig}>
        <PageSound
          silent={router.pathname === '/'}
          enabled={soundEnabled}
          volume={soundVolume}
          onEnabledChange={setSoundEnabled}
          onVolumeChange={setSoundVolume}
        >
          <SeoHead
            title={router.pathname === '/battle' ? 'Mog Battle: Compare Photos | Mogging' : undefined}
            description={router.pathname === '/battle' ? 'Compare photos in Mogging battles and see how community votes shape the leaderboard. Rankings reflect voter preferences.' : undefined}
          />
          {router.pathname.startsWith('/admin/') ? (
            <AdminShell><Component {...pageProps} /></AdminShell>
          ) : courseRoute ? (
            <Component {...pageProps} />
          ) : (
            <AppShell><Component {...pageProps} /></AppShell>
          )}
          <Toaster
            position="top-center"
            theme="light"
            icons={{
              success: <CircleCheck className="size-5" strokeWidth={1.8} />,
              error: <CircleAlert className="size-5" strokeWidth={1.8} />,
            }}
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: 'flex w-full items-center gap-3 rounded-[24px] border border-zinc-200/80 bg-white p-4 text-black shadow-[0_8px_30px_rgba(0,0,0,0.10),0_2px_6px_rgba(0,0,0,0.04)]',
                content: 'min-w-0 flex-1',
                icon: 'flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-800',
                title: 'text-sm font-medium leading-5 tracking-[-0.01em]',
                description: 'mt-1 text-sm leading-5 text-zinc-500',
                actionButton: 'shrink-0 rounded-full bg-black px-3 py-2 text-xs font-medium text-white',
                cancelButton: 'shrink-0 rounded-full bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700',
                closeButton: 'grid size-6 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-500',
              },
            }}
          />
        </PageSound>
      </SWRConfig>
    </SessionProvider>
  )
}
