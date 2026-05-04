import type { AppProps } from 'next/app'
import { useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { SWRConfig } from 'swr'
import { Toaster } from 'sonner'
import { SoundProvider } from '@web-kits/audio/react'
import { AppShell } from '@/components/app/app-shell'
import { SeoHead } from '@/components/app/seo-head'
import { swrConfig } from '@/lib/swr'
import '@/styles/globals.css'

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundVolume, setSoundVolume] = useState(0.82)

  return (
    <SessionProvider session={session}>
      <SWRConfig value={swrConfig}>
        <SoundProvider
          enabled={soundEnabled}
          volume={soundVolume}
          onEnabledChange={setSoundEnabled}
          onVolumeChange={setSoundVolume}
        >
          <SeoHead />
          <AppShell>
            <Component {...pageProps} />
          </AppShell>
          <Toaster
            position="top-center"
            icons={{
              success: <span className="block size-2.5 rounded-full bg-black" />,
              error: <span className="block size-2.5 rounded-full bg-black" />,
            }}
            toastOptions={{
              classNames: {
                toast: 'rounded-[22px] border border-zinc-200 bg-white/95 px-4 py-3 text-black shadow-[0_18px_55px_rgba(15,23,42,0.14)] backdrop-blur-xl',
                title: 'text-sm font-semibold tracking-[-0.02em] text-black',
                description: 'text-sm text-zinc-500',
                actionButton: 'rounded-full bg-black text-white',
                cancelButton: 'rounded-full bg-zinc-100 text-black',
                closeButton: 'border border-zinc-200 bg-white text-black',
                error: 'rounded-[22px] border border-zinc-200 bg-white/95 text-black backdrop-blur-xl',
                success: 'rounded-[22px] border border-zinc-200 bg-white/95 text-black backdrop-blur-xl',
              },
            }}
          />
        </SoundProvider>
      </SWRConfig>
    </SessionProvider>
  )
}
