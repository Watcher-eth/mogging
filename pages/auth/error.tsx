import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRef, useState } from 'react'

type Props = { mobile: boolean; callbackUrl: string; cancelled: boolean }

export default function AuthErrorPage({ mobile, callbackUrl, cancelled }: Props) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
    <Head><title>Try signing in again · Mogging</title></Head>
    <section className="w-full text-center">
      <h1 className="text-3xl font-semibold">{cancelled ? 'Sign-in was cancelled' : 'Let’s restart your sign-in'}</h1>
      <p className="mt-4 text-zinc-600">{cancelled ? 'You can try again whenever you’re ready.' : 'Your sign-in session could not be verified. Start again in this browser and complete the Google prompt once.'}</p>
      <button disabled={busy} className="mt-6 rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
        onClick={() => { if (pending.current) return; pending.current = true; setBusy(true); void signIn('google', { callbackUrl }).catch(() => { pending.current = false; setBusy(false) }) }}>
        {busy ? 'Connecting…' : 'Try Google again'}
      </button>
      {mobile ? <a className="mt-4 block text-sm underline" href={`mogging://auth/google#error=${cancelled ? 'provider_cancelled' : 'oauth_session_expired'}`}>Return to the app</a> : <Link className="mt-4 block text-sm underline" href="/">Return to Mogging</Link>}
    </section>
  </main>
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, query }) => {
  let callbackUrl = '/'
  try {
    const callback = new URL(req.cookies['__Secure-next-auth.callback-url'] || req.cookies['next-auth.callback-url'] || '')
    const origin = new URL(process.env.NEXTAUTH_URL || 'https://www.mogging.com').origin
    if (callback.origin === origin && !callback.pathname.startsWith('/auth/') && !callback.pathname.startsWith('//')) callbackUrl = callback.pathname + callback.search
  } catch {}
  return { props: { mobile: callbackUrl.startsWith('/app/mobile-auth'), callbackUrl, cancelled: query.error === 'AccessDenied' } }
}
