import type { GetServerSideProps } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useCallback, useEffect, useState } from 'react'
import * as Avatar from '@radix-ui/react-avatar'
import { ArrowRight, Check, Loader2 } from 'lucide-react'
import { LoginDialog } from '@/components/app/app-shell'
import { Button } from '@/components/ui/button'
import { CreatorIcon } from '@/components/creator/creator-icon'
import { apiPost } from '@/lib/api/client'
import { getCreatorInvitePreview } from '@/lib/creator/invites'
import { CREATOR_INVITE_PROGRESS, type CreatorInvitePreview } from '@/lib/creator/invite-validation'
import { siteUrl } from '@/lib/seo'

type Props = { invite: CreatorInvitePreview; token: string; url: string; imageUrl: string }
const pendingClaimKey = 'creator-invite-claim'

export default function CreatorInvitePage({ invite, token, url, imageUrl }: Props) {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [loginOpen, setLoginOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = invite.state === 'ready'
  const title = ready ? `${invite.displayName}, your creator setup is ${CREATOR_INVITE_PROGRESS}% complete` : 'Your Mogging creator invitation'
  const description = ready ? 'Your TikTok account and analytics are verified. Claim your account and choose your payout method to finish setup.' : 'Continue in Creator Studio or contact our team on Discord for a new invitation.'

  const claim = useCallback(async () => {
    if (!session?.user?.id) {
      sessionStorage.setItem(pendingClaimKey, token)
      setLoginOpen(true)
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await apiPost<{ destination: string }>('/api/creator/claim-invite', { token })
      await router.push(result.destination)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not claim your invitation. Please try again.')
    } finally { setBusy(false) }
  }, [session?.user?.id, token, router])

  useEffect(() => {
    if (status !== 'authenticated' || !ready || sessionStorage.getItem(pendingClaimKey) !== token) return
    sessionStorage.removeItem(pendingClaimKey)
    void claim()
  }, [status, ready, token, claim])

  return <>
    <Head>
      <title key="title">{title}</title>
      <meta key="description" name="description" content={description} />
      <meta key="robots" name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
      <link key="canonical" rel="canonical" href={url} />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      <meta key="og:url" property="og:url" content={url} />
      <meta key="og:image" property="og:image" content={imageUrl} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />
      <meta key="og:image:alt" property="og:image:alt" content={title} />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={imageUrl} />
    </Head>
    <main className="creator-portal flex flex-1 items-center justify-center bg-white px-5 py-12 text-[#181a1d]">
      <section className="w-full max-w-lg">
        <Link href="/creator" className="mb-8 flex items-center justify-center gap-3 text-sm font-medium"><Image src="/favicon.png" width={32} height={32} alt="" className="rounded-[9px]" />Mogging / Creator Studio</Link>
        <div className="creator-surface rounded-[28px] p-7 shadow-[0_2px_12px_rgba(24,26,29,0.035)] sm:p-9">
          <div className="flex items-center gap-4">
            <Avatar.Root className="flex size-16 shrink-0 overflow-hidden rounded-full bg-[#f4f5f6]">
              {invite.avatarUrl ? <Avatar.Image src={invite.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-full object-cover" /> : null}
              <Avatar.Fallback className="grid size-full place-items-center text-2xl">{invite.displayName[0]}</Avatar.Fallback>
            </Avatar.Root>
            <div className="min-w-0"><h1 className="truncate text-xl font-medium tracking-tight">{invite.displayName}</h1><p className="mt-1 text-sm text-[#73777d]">@{invite.handle} · TikTok</p></div>
          </div>
          <h2 className="mt-7 text-[2rem] font-medium leading-tight tracking-[-0.05em]">{ready ? 'We’ve got you started.' : invite.state === 'claimed' ? 'Your invitation was claimed.' : 'Let’s get you a fresh link.'}</h2>
          <p className="mt-3 text-sm leading-6 text-[#73777d]">{description}</p>
          {ready ? <>
            <div className="mt-7 flex items-center justify-between gap-4 text-sm"><span className="text-[#73777d]">Creator setup</span><span className="text-lg font-medium text-[#00A8EF]">{CREATOR_INVITE_PROGRESS}% complete</span></div>
            <div role="progressbar" aria-label="Creator setup" aria-valuenow={CREATOR_INVITE_PROGRESS} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-3 overflow-hidden rounded-full bg-[#eeeeef]"><div className="creator-progress h-full rounded-full bg-[#00A8EF]" style={{ width: `${CREATOR_INVITE_PROGRESS}%` }} /></div>
            <ul className="my-7 space-y-4 text-sm">
              {(['Account connected', 'Audience analytics verified'] as const).map((label) => <li key={label} className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-full bg-[#00A8EF] text-white"><Check className="size-4" strokeWidth={2.75} /></span>{label}</li>)}
              <li className="flex items-center gap-3 text-[#73777d]"><CreatorIcon name="payouts" className="size-7" />Choose your payout method</li>
            </ul>
          </> : null}
          {error ? <p role="alert" className="my-4 text-sm text-red-600">{error}</p> : null}
          {ready || (invite.state === 'claimed' && session) ? <Button className="mt-5 h-12 w-full rounded-full" disabled={busy || status === 'loading'} onClick={() => void claim()}>{busy ? <Loader2 className="animate-spin" /> : null}Claim your account<ArrowRight /></Button> : <Button asChild className="mt-6 h-12 w-full rounded-full"><Link href="/creator">Open Creator Studio<ArrowRight /></Link></Button>}
          {ready && session ? <p className="mt-3 text-center text-xs text-[#73777d]">Signed in as {session.user?.email || session.user?.name}. This account will receive your creator setup.</p> : null}
        </div>
      </section>
    </main>
    <LoginDialog audience="creator" open={loginOpen} onOpenChange={(open) => {
      setLoginOpen(open)
      if (!open) sessionStorage.removeItem(pendingClaimKey)
    }} callbackUrl={`/creator/invite/${token}`} />
  </>
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params, res }) => {
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')
  const token = typeof params?.token === 'string' ? params.token : ''
  const invite = await getCreatorInvitePreview(token)
  if (!invite) return { notFound: true }
  return { props: { invite, token, url: `${siteUrl}/creator/invite/${token}`, imageUrl: `${siteUrl}/api/og/creator-invite?token=${token}` } }
}
