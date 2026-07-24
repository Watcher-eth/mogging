import Head from 'next/head'
import { useRouter } from 'next/router'
import { signIn, useSession } from 'next-auth/react'
import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiPost } from '@/lib/api/client'

const mobileRedirectUri = 'mogging://auth/google'

type MobileSession = {
  token: string
  userId: string
  expiresAt: string
}

export default function MobileAuthPage() {
  const router = useRouter()
  const { status } = useSession()
  const started = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!router.isReady || status === 'loading' || started.current) return
    started.current = true

    if (status === 'unauthenticated') {
      const callbackUrl = `${window.location.origin}/app/mobile-auth`
      void signIn('google', { callbackUrl })
      return
    }

    void apiPost<MobileSession>('/api/auth/mobile-session', {})
      .then((session) => {
        const params = new URLSearchParams({
          token: session.token,
          userId: session.userId,
          expiresAt: session.expiresAt,
        })
        window.location.replace(`${mobileRedirectUri}#${params.toString()}`)
      })
      .catch((caught) => {
        started.current = false
        setError(caught instanceof Error ? caught.message : 'Unable to return to Mogging')
      })
  }, [router.isReady, status])

  return (
    <>
      <Head>
        <title>Continue to Mogging</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-xl items-center px-6 py-12">
        <section className="w-full border-y border-zinc-200 py-12 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin" />
          <h1 className="mt-6 text-3xl font-semibold text-black">Connecting your Mogging account</h1>
          <p className="mt-3 text-zinc-600">You’ll return to the app automatically.</p>
          {error ? <p className="mt-5 text-sm text-red-700">{error}</p> : null}
        </section>
      </main>
    </>
  )
}
