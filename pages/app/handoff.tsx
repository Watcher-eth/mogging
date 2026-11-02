import { motion, useReducedMotion } from 'motion/react'
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
  analysisUrl?: string
}

export default function PaymentHandoffPage() {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const { status } = useSession()
  const sessionId = singleQueryValue(router.query.session_id)
  const suppliedToken = singleQueryValue(router.query.token)
  const [handoff, setHandoff] = useState<HandoffResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!router.isReady) return
    if (!sessionId || status !== 'authenticated') return
    setError(null)
    setHandoff(null)

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0

    async function createHandoff() {
      try {
        const result = await apiPost<HandoffResponse>('/api/payments/handoff/create', { sessionId }, { signal: AbortSignal.timeout(20_000) })
        if (cancelled) return
        if (result.analysisUrl) {
          await router.replace(result.analysisUrl)
          return
        }
        setHandoff(result)
        timer = setTimeout(() => setRetry(value => value + 1), Math.max(1000, Date.parse(result.expiresAt) - Date.now() + 100))
        trackWebEvent('handoff_created', { stripeCheckoutSessionId: sessionId })
      } catch (caught) {
        if (cancelled) return
        if ((!(caught instanceof ApiClientError) || caught.status === 409 || caught.status >= 500) && attempts < 6) {
          attempts += 1
          timer = setTimeout(createHandoff, Math.min(1000 * 2 ** attempts, 10000))
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
  }, [router, router.isReady, sessionId, status, retry])

  const token = handoff?.token || (!sessionId || status === 'unauthenticated' ? suppliedToken : null)
  const appUrl = useMemo(() => {
    if (!token) return null
    // An explicit scheme also opens the app from Safari on this same domain.
    const url = new URL('mogging://app/handoff')
    url.searchParams.set('token', token)
    return url.toString()
  }, [token])

  return (
    <>
      <Head>
        <title>Open Mogging</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Head>
      <main className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-3xl items-center px-5 py-12 sm:px-10">
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : .26, ease: [.22, 1, .36, 1] }} className="w-full rounded-[32px] border border-zinc-100 bg-white p-7 shadow-[0_20px_80px_#00000005] sm:p-12">
          <div className="mb-7 grid size-14 place-items-center rounded-2xl bg-zinc-50 text-zinc-800" aria-hidden="true">{token ? <Check size={26} strokeWidth={1.5} /> : <Download size={24} strokeWidth={1.5} />}</div>
          <p className="text-[10px] font-medium uppercase tracking-[.12em] text-zinc-400">{token ? 'Payment confirmed' : 'Purchase activation'}</p>
          <h1 className="mt-5 max-w-2xl text-4xl font-semibold tracking-[-.055em] leading-[1.05] text-black sm:text-5xl">
            {token ? 'Your Mogging access is ready.' : 'Continue your Mogging purchase.'}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-500">
            Open the app to continue your evaluation. You can also sign in to the app with the same account you used at checkout to restore your purchase.
          </p>

          <div className="mt-10 border-t border-zinc-200 pt-8">
            {status === 'loading' || (!token && !error && !!sessionId && status === 'authenticated') ? (
              <div className="flex items-center gap-3 text-sm font-medium text-zinc-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Securing your one-time app handoff
              </div>
            ) : null}

            {status === 'unauthenticated' && !suppliedToken ? (
              <div>
                <p className="text-sm text-zinc-600">Sign in with the account used at checkout to continue.</p>
                <Link
                  className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white"
                  href={`/?login=1&next=${encodeURIComponent(router.asPath)}`}
                >
                  Sign in <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
            ) : null}

            {error ? (
              <div>
                <p role="alert" className="border-l-2 border-red-500 pl-4 text-sm text-red-700">{error}</p>
                <button type="button" onClick={() => setRetry(value => value + 1)} className="mt-4 inline-flex h-12 items-center rounded-full bg-black px-6 text-sm font-semibold text-white">Try again</button>
              </div>
            ) : null}
            {!sessionId && !suppliedToken ? <p role="alert" className="text-sm text-zinc-600">Reopen the confirmation page from your purchase email, or sign in to Mogging with the account used at checkout.</p> : null}

            {appUrl ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <a
                  href={appUrl}
                  onClick={() => trackWebEvent('handoff_opened', { destination: 'installed_app' })}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-full bg-black transition-transform active:scale-[.98] motion-reduce:transform-none px-6 text-sm font-semibold text-white"
                >
                  <Check className="h-5 w-5" /> Open Mogging
                </a>
                <a
                  href={appStoreUrl}
                  onClick={() => trackWebEvent('handoff_opened', { destination: 'app_store' })}
                  className="inline-flex h-14 items-center justify-center gap-2 rounded-full border border-zinc-200 transition-transform active:scale-[.98] motion-reduce:transform-none px-6 text-sm font-semibold text-black"
                >
                  <Download className="h-5 w-5" /> Download the app
                </a>
              </div>
            ) : null}
          </div>
        </motion.section>
      </main>
    </>
  )
}

function singleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null
}
