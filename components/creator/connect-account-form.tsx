import { useSession } from 'next-auth/react'
import { canManuallyConnectTikTok } from '@/lib/creator/manual-account-access'
import { useState, type FormEvent } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { Field, fieldClass } from './creator-shell'
import type { CreatorSocialAccount } from './types'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export function ConnectAccountForm({ platform, onPlatformChange, disabled, onConnected, counts, destination = 'accounts' }: { platform: 'tiktok' | 'instagram'; onPlatformChange: (platform: 'tiktok' | 'instagram') => void; disabled: boolean; onConnected: (account: CreatorSocialAccount) => Promise<void>; counts: { tiktok: number; instagram: number }; destination?: 'accounts' | 'setup' }) {
  const { data: session } = useSession()
  const [tiktokConnection, setTikTokConnection] = useState<'oauth' | 'manual'>('oauth')
  const manualTikTokAllowed = canManuallyConnectTikTok(session?.user?.email)
  const manualTikTok = platform === 'tiktok' && manualTikTokAllowed && tiktokConnection === 'manual'
  const platformLabel = platform === 'tiktok' ? 'TikTok' : 'Instagram'
  const [busy, setBusy] = useState(false)
  const [handle, setHandle] = useState('')
  const [profileUrl, setProfileUrl] = useState('')

  async function connectTikTok() {
    setBusy(true)
    try {
      const { authorizeUrl } = await apiPost<{ authorizeUrl: string }>('/api/creator/oauth/tiktok/start', { destination })
      window.location.assign(authorizeUrl)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not start account connection')
      setBusy(false)
    }
  }

  async function connectManually(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { account } = await apiPost<{ account: CreatorSocialAccount }>('/api/creator/accounts', { platform, handle, profileUrl: profileUrl || null })
      await onConnected(account)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : `Could not connect ${platformLabel}`)
    } finally { setBusy(false) }
  }

  return (
        <div className="grid gap-6 p-6 sm:p-7">
          <div className="grid grid-cols-2 gap-2">
            {(['tiktok', 'instagram'] as const).map((option) => (
              <button key={option} type="button" disabled={busy} onClick={() => onPlatformChange(option)} className={cn('flex items-center gap-2 rounded-[14px] border px-4 py-3 text-left text-sm font-medium capitalize transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', platform === option ? 'border-[#0071e3]/30 bg-[#e8f2ff] text-[#0071e3] shadow-[0_0_0_3px_rgba(0,113,227,0.06)]' : 'border-black/[0.08] bg-white hover:bg-[#f5f5f7]')}>
                <SocialPlatformLogo platform={option} className="size-5" />
                <span>{option}</span><span className={cn('ml-auto text-xs', platform === option ? 'text-[#0071e3]/60' : 'text-[#86868b]')}>{counts[option]}/5</span>
              </button>
            ))}
          </div>
          {disabled ? <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />You’ve reached the five-account limit for this platform.</div> : null}

          {platform === 'tiktok' && !manualTikTok ? <div className="rounded-[18px] bg-[#f5f5f7] p-5 text-center">
            <SocialPlatformLogo platform="tiktok" className="mx-auto size-10" />
            <h3 className="mt-4 text-sm font-semibold">Connect With TikTok</h3>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-500">Sign in securely to share your account details. Then upload your audience recording to complete verification.</p>
            <Button type="button" className="mt-5 h-11 w-full rounded-full bg-black text-white hover:bg-black/85" disabled={disabled || busy} onClick={() => void connectTikTok()}>{busy ? <Loader2 className="animate-spin" /> : <SocialPlatformLogo platform="tiktok" className="size-5" />}{busy ? 'Connecting…' : 'Continue With TikTok'}</Button>
            {manualTikTokAllowed ? <button type="button" className="mt-3 min-h-11 text-sm font-semibold underline underline-offset-4 disabled:opacity-50" disabled={busy || disabled} onClick={() => setTikTokConnection('manual')}>Connect manually instead</button> : null}
          </div> : <form onSubmit={connectManually} className="grid gap-4">
            <Field label="Username"><div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">@</span><input className={cn(fieldClass, 'pl-8')} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="creatorname" required disabled={busy} /></div></Field>
            <Field label="Profile URL" hint={manualTikTok ? "Required" : "Optional"}><input className={fieldClass} type="url" value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder={manualTikTok ? 'https://www.tiktok.com/@creatorname' : 'https://instagram.com/creatorname'} required={manualTikTok} disabled={busy} /></Field>
            <Button className="h-11 rounded-full" disabled={disabled || busy}>{busy ? <Loader2 className="animate-spin" /> : <SocialPlatformLogo platform={platform} className="size-5" />}{busy ? 'Connecting…' : `Connect ${platformLabel} Account`}</Button>
            {manualTikTok ? <button type="button" className="min-h-11 text-sm font-semibold underline underline-offset-4 disabled:opacity-50" disabled={busy} onClick={() => setTikTokConnection('oauth')}>Connect with TikTok instead</button> : null}
          </form>}
        </div>

  )
}
