import type { AppProps } from 'next/app'
import { SessionProvider } from 'next-auth/react'
import { SWRConfig } from 'swr'
import { Toaster } from 'sonner'
import { AppShell } from '@/components/app/app-shell'
import { swrConfig } from '@/lib/swr'
import '@/styles/globals.css'

export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <SWRConfig value={swrConfig}>
        <AppShell>
          <Component {...pageProps} />
        </AppShell>
        <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: 'border border-black bg-white text-black shadow-[0_18px_50px_rgba(15,23,42,0.12)] rounded-none',
              title: 'text-sm font-semibold tracking-[-0.02em] text-black',
              description: 'text-sm text-zinc-500',
              actionButton: 'bg-black text-white',
              cancelButton: 'bg-zinc-100 text-black',
              closeButton: 'border border-zinc-300 bg-white text-black',
              error: 'border border-black bg-white text-black',
              success: 'border border-black bg-white text-black',
            },
          }}
        />
      </SWRConfig>
    </SessionProvider>
  )
}
