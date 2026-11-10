import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useRef, useState } from 'react'
import { authReturnPath, isEmbeddedBrowser, oauthProvider, oauthProviders, type OAuthProvider } from '@/lib/auth/browser-flow'

type Props = { mobile: boolean; callbackUrl: string; cancelled: boolean; embedded: boolean; provider: OAuthProvider }

export default function AuthErrorPage({ mobile, callbackUrl, cancelled, embedded = false, provider = 'google' }: Props) {
  const pending = useRef(false)
  const [busy, setBusy] = useState(false)
  return <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
    <Head><title>Try signing in again · Mogging</title></Head>
    <section className="w-full text-center">
      <h1 className="text-3xl font-semibold">{cancelled ? 'Sign-in was cancelled' : 'Let’s restart your sign-in'}</h1>
      <p className="mt-4 text-zinc-600">{cancelled ? 'You can try again whenever you’re ready.' : `Your sign-in session could not be verified. Restart here and complete the ${oauthProviders[provider]} prompt in the same browser.`}</p>
      {embedded ? <p className="mt-4 text-sm leading-6 text-zinc-600">In Instagram or TikTok, use the browser menu to open this page in Safari or Chrome first. Start a fresh sign-in there; an earlier sign-in cannot be continued in a different browser.</p> : null}
      <button disabled={busy} className="mt-6 rounded-full bg-black px-6 py-3 text-white disabled:opacity-50"
        onClick={() => { if (pending.current) return; pending.current = true; setBusy(true); void signIn(provider, { callbackUrl }).catch(() => { pending.current = false; setBusy(false) }) }}>
        {busy ? 'Connecting…' : `Try ${oauthProviders[provider]} again`}
      </button>
      {mobile ? <a className="mt-4 block text-sm underline" href={`mogging://auth/google#error=${cancelled ? 'provider_cancelled' : 'oauth_session_expired'}`}>Return to the app</a> : <Link className="mt-4 block text-sm underline" href="/">Return to Mogging</Link>}
    </section>
  </main>
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ req, query }) => {
  const callbackUrl = authReturnPath(req.cookies['__Secure-next-auth.callback-url'] || req.cookies['next-auth.callback-url'], process.env.NEXTAUTH_URL || 'https://www.mogging.com')
  return { props: { mobile: callbackUrl.startsWith('/app/mobile-auth'), callbackUrl, cancelled: query.error === 'AccessDenied',
    embedded: isEmbeddedBrowser(req.headers['user-agent'] || ''), provider: oauthProvider(req.cookies.mogging_auth_provider) } }
}
