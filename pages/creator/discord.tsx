import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import useSWR from 'swr'
import { useSession } from 'next-auth/react'
import { Check, Loader2, MessageCircle } from 'lucide-react'
import { CreatorShell } from '@/components/creator/creator-shell'
import { Button } from '@/components/ui/button'
import { apiGet, apiPost, apiRequest } from '@/lib/api/client'

type Connection = { configured: boolean; applicationId: string; link: { discordUsername: string; discordUserId: string; createdAt: string } | null }
const errors: Record<string, string> = {
  expired: 'Your connection request expired. Please connect again.',
  cancelled: 'Discord connection was cancelled. Your account has not changed.',
  conflict: 'One of these accounts is already connected. Disconnect the existing account in Creator Studio before changing accounts.',
  failed: 'We couldn’t connect Discord. Please try again.',
}
export default function CreatorDiscordPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const { data, error, mutate } = useSWR(status === 'authenticated' && session.user?.id ? ['/api/creator/discord', session.user.id] : null, ([path]) => apiGet<Connection>(path))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const callbackError = typeof router.query.error === 'string' ? errors[router.query.error] : undefined
  async function connect() {
    setBusy(true); setMessage('')
    try {
      const result = await apiPost<{ url: string }>('/api/creator/discord')
      window.location.assign(result.url)
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Couldn’t connect. Please try again.'); setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setMessage('')
    try {
      await apiRequest('/api/creator/discord', { method: 'DELETE' })
      await mutate()
      await router.replace('/creator/discord', undefined, { shallow: true })
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Couldn’t disconnect. Please try again.') }
    finally { setBusy(false) }
  }
  return <CreatorShell>
    <div className="mx-auto w-full max-w-xl py-8 sm:py-14">
      <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-sky-50 text-[#00A8EF]"><MessageCircle className="size-6" aria-hidden="true" /></div>
      <h1 className="text-2xl font-semibold tracking-tight">Mogging Support on Discord</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Connect your Discord account, then DM Mogging Support to chat about your campaigns, submissions, and creator questions.</p>
      <div className="mt-7 rounded-2xl border border-border/60 bg-background p-5 sm:p-6">
        {!data && !error ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin motion-reduce:animate-none" />Checking connection…</p> : null}
        {error ? <p role="alert" className="text-sm text-red-600">Couldn’t load your Discord connection. Please refresh to try again.</p> : null}
        {data?.link ? <>
          <p className="flex items-center gap-2 text-sm font-medium"><Check className="size-4 text-emerald-600" aria-hidden="true" />Connected as {data.link.discordUsername}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Message the bot directly and chat normally—no commands needed. Type “allowance” to check your remaining messages or “reset” for a fresh conversation.</p>
          <a href={`https://discord.com/users/${encodeURIComponent(data.applicationId)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-sm font-medium text-[#00A8EF] hover:underline">Message Mogging Support →</a>
          <Button className="mt-5" variant="outline" onClick={disconnect} disabled={busy}>{busy ? 'Disconnecting…' : 'Disconnect Discord'}</Button>
        </> : data ? <>
          <p className="text-sm font-medium">Connect your creator account privately</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">You’ll confirm your Discord identity before connecting it to the Creator Studio account you’re signed into here. The bot can read your creator information to answer your questions.</p>
          <Button className="mt-5" onClick={connect} disabled={busy || !data.configured}>{busy ? 'Opening Discord…' : 'Connect Discord'}</Button>
          {!data.configured ? <p className="mt-3 text-sm text-muted-foreground">Discord support is being set up. Creator Studio support is available below.</p> : null}
        </> : null}
        {message || callbackError ? <p className="mt-4 text-sm text-red-600" role="alert">{message || callbackError}</p> : null}
      </div>
      <p className="mt-5 text-xs leading-5 text-muted-foreground">The standard allowance is four daily support messages shared across DMs, server commands, and Creator Studio, resetting at midnight UTC. Connecting, help, checking your allowance, and disconnecting don’t use a message. Only messages you send to this bot are used; your other Discord conversations stay private.</p>
      <Link href="/creator/support" className="mt-5 inline-flex text-sm font-medium text-[#00A8EF] hover:underline">Open Creator Studio support →</Link>
    </div>
  </CreatorShell>
}
