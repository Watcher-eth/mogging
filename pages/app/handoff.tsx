import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Check, Download, Loader2 } from 'lucide-react'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { trackWebEvent } from '@/lib/analytics/client'

const appStoreUrl = 'https://apps.apple.com/us/app/mogging-face-rating/id6771414050'

type HandoffResponse = {
  token: string
  expiresAt: string
}

export default function PaymentHandoffPage() {
  const router = useRouter()
  const { status } = useSession()
  const sessionId = singleQueryValue(router.query.session_id)
  const suppliedToken = singleQueryValue(router.query.token)
  const [handoff, setHandoff] = useState<HandoffResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!router.isReady || suppliedToken) return
    if (!sessionId || status !== 'authenticated') return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    async function createHandoff() {
      try {
        const result = await apiPost<HandoffResponse>('/api/payments/handoff/create', { sessionId })
        if (cancelled) return
        setHandoff(result)
        trackWebEvent('handoff_created', { stripeCheckoutSessionId: sessionId })
      } catch (caught) {
        if (cancelled) return
        if (caught instanceof ApiClientError && caught.status === 409 && attempts < 12) {
          attempts += 1
          timer = setTimeout(createHandoff, 1500)
          return
        }
        setError(caught instanceof Error ? caught.message : 'Unable to prepare your app access')
      }
    }

    void createHandoff()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [router.isReady, sessionId, status, suppliedToken])

  const token = suppliedToken || handoff?.token || null
  const appUrl = useMemo(() => {
    if (!token || typeof window === 'undefined') return null
    const url = new URL('/app/handoff', window.location.origin)
    url.searchParams.set('token', token)
    return url.toString()
  }, [token])

  return (
    <>
      <Head>
        <title>Open Mogging</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-center px-5 py-12 sm:px-10">
        <section className="w-full border-y border-zinc-200 py-10 sm:py-14">
          <p className="font-mono text-xs font-semibold uppercase text-zinc-500">Payment confirmed</p>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-normal text-black sm:text-6xl">
            Your Mogging access is ready.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-zinc-600">
            Open the app to attach this purchase to your account and continue your evaluation.
          </p>

          <div className="mt-10 border-t border-zinc-200 pt-8">
            {status === 'loading' || (!token && !error && status === 'authenticated') ? (
              <div className="flex items-center gap-3 text-sm font-medium text-zinc-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Securing your one-time app handoff
              </div>
            ) : null}

            {status === 'unauthenticated' && !suppliedToken ? (
              <div>
                <p className="text-sm text-zinc-600">Sign in with the account used at checkout to continue.</p>
                <Link
                  className="mt-5 inline-flex h-12 items-center gap-2 bg-black px-6 text-sm font-semibold text-white"
                  href={`/?login=1&next=${encodeURIComponent(router.asPath)}`}
                >
                  Sign in <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}

            {error ? (
              <div className="border-l-2 border-red-500 pl-4 text-sm text-red-700">{error}</div>
            ) : null}

            {appUrl ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href={appUrl}
                  onClick={() => trackWebEvent('handoff_opened', { destination: 'universal_link' })}
                  className="inline-flex h-14 items-center justify-center gap-2 bg-black px-6 text-sm font-semibold text-white"
                >
                  <Check className="h-5 w-5" /> Open Mogging
                </a>
                <a
                  href={appStoreUrl}
                  onClick={() => trackWebEvent('handoff_opened', { destination: 'app_store' })}
                  className="inline-flex h-14 items-center justify-center gap-2 border border-zinc-300 px-6 text-sm font-semibold text-black"
                >
                  <Download className="h-5 w-5" /> Download the app
                </a>
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </>
  )
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null
}
