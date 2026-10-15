import Head from 'next/head'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import type { GetServerSideProps, InferGetServerSidePropsType } from 'next'
import { eq } from 'drizzle-orm'
import { db, schema } from '@/lib/db'
import { getAuthSession } from '@/lib/auth/session'
import { env } from '@/lib/env'
import { appStoreUrl } from '@/lib/seo'
import { createReferralTicket, creditReferralSignup, referralCookie, REFERRAL_COOKIE, readReferralTicket } from '@/lib/referrals/service'

type InvitePageProps = { code: string; account: { email: string | null; credited: boolean } | null; googleAvailable: boolean }

export const getServerSideProps: GetServerSideProps<InvitePageProps> = async ({ params, req, res }) => {
  const code = typeof params?.referral === 'string' ? params.referral : ''
  const ticket = await createReferralTicket(code)
  if (!ticket) return { notFound: true }
  const existingTicket = req.cookies[REFERRAL_COOKIE]
  const existingReferral = readReferralTicket(existingTicket)
  const pendingTicket = existingReferral ? existingTicket : ticket
  if (pendingTicket === ticket) res.setHeader('Set-Cookie', referralCookie(ticket))
  res.setHeader('Cache-Control', 'private, no-store')
  const session = await getAuthSession(req, res)
  let account: InvitePageProps['account'] = null
  if (session?.user?.id) {
    await creditReferralSignup(session.user.id, pendingTicket)
    const [signup] = await db.select({ id: schema.referralSignups.referredUserId }).from(schema.referralSignups)
      .where(eq(schema.referralSignups.referredUserId, session.user.id))
    account = { email: session.user.email ?? null, credited: Boolean(signup) }
  }
  return { props: { code: existingReferral?.code ?? code, account, googleAvailable: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) } }
}

export default function ReferralInvite({ code, account, googleAvailable }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = `https://www.mogging.com/${code}`

  async function copyAndDownload() {
    setBusy(true); setError(null)
    try {
      await navigator.clipboard.writeText(url)
      window.location.assign(appStoreUrl)
    } catch {
      setError('Copy the invite link below, then download Mogging. You can paste it before signing in to the app.')
      setBusy(false)
    }
  }

  async function saveInvitation() {
    setBusy(true); setError(null)
    try { await signIn('google', { callbackUrl: `/${code}` }) }
    catch { setError('Could not open Google sign-in. Try again, or copy your invite instead.'); setBusy(false) }
  }

  return <>
    <Head><title>Your Mogging invitation</title><meta name="robots" content="noindex,nofollow" /></Head>
    <section className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-5 py-12">
      <p className="mb-5 text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">You’re invited</p>
      <h1 className="text-4xl font-semibold leading-tight tracking-tight">{account?.credited ? 'Your invitation is saved.' : 'Discover your potential. Together.'}</h1>
      <p className="mt-4 text-base leading-7 text-zinc-500">
        {account?.credited ? 'Download Mogging and continue with the same account. Your friend’s referral is already recorded.'
          : account ? 'You already have an account. Download Mogging to continue; only new accounts count toward your friend’s free scan.'
          : googleAvailable ? 'Save your invitation with Google before downloading. When you create your account, you help your friend unlock a free face scan.'
          : 'Copy your invitation before downloading, then paste it before signing in to the app. Your new account helps your friend unlock a free face scan.'}
      </p>
      {account?.email ? <p className="mt-3 break-all text-sm font-medium">{account.email}</p> : null}
      <div className="mt-8 grid gap-3">
        {!account && googleAvailable ? <>
          <button type="button" disabled={busy} onClick={() => void saveInvitation()} className="min-h-12 rounded-full bg-black px-5 py-3 font-medium text-white disabled:opacity-50">{busy ? 'Please wait…' : 'Save invite with Google'}</button>
          <p className="text-center text-xs leading-5 text-zinc-500">Use this same Google account in the app after installing.</p>
        </> : null}
        {account ? <a href={appStoreUrl} className="rounded-full bg-black px-5 py-3 text-center font-medium text-white">Download Mogging for iPhone</a>
          : <button type="button" disabled={busy} onClick={() => void copyAndDownload()} className="min-h-12 rounded-full border border-zinc-200 px-5 py-3 font-medium disabled:opacity-50">Copy invite &amp; get the app</button>}
        <p className="text-center text-xs leading-5 text-zinc-500">Already installed? Reopen your original invite link to save it in the app.</p>
      </div>
      {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error} <a className="underline" href={appStoreUrl}>Download app</a></p> : null}
      {!account ? <div className="mt-7 border-t border-zinc-100 pt-5">
        <label htmlFor="invite-link" className="text-xs text-zinc-500">Your invite link · paste it before signing in on mobile</label>
        <input id="invite-link" readOnly value={url} onFocus={event => event.currentTarget.select()} className="mt-2 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm" />
      </div> : null}
      <p className="mt-6 text-xs leading-5 text-zinc-500">Three new friends joining through an invite unlocks one free scan for the inviter. No purchase needed.</p>
    </section>
  </>
}
