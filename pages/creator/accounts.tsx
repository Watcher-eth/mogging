import { creatorSocialAccountSchema } from '@/lib/creator/validation'
import { creatorAccountLabel } from '@/components/creator/types'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { AlertCircle, Check, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CreatorAuthPrompt } from '@/components/creator/creator-auth-prompt'
import { AccountVerificationDialog } from '@/components/creator/account-verification-dialog'
import { AccountTrackingLink } from '@/components/creator/account-tracking-link'
import { SocialPlatformLogo, type SocialPlatform } from '@/components/brand/social-platform-logo'
import { CreatorHeader, CreatorShell, Field, fieldClass } from '@/components/creator/creator-shell'
import { CreatorIcon } from '@/components/creator/creator-icon'
import { AccountReviewNote } from '@/components/creator/content-guidelines'
import type { CreatorDashboard, CreatorSocialAccount } from '@/components/creator/types'
import { apiGet, apiPost, apiRequest, ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'

export default function CreatorAccountsPage() {
  const { status } = useSession()
  return (
    <CreatorShell allowUnauthenticated>
      {status === 'unauthenticated' ? <CreatorAuthPrompt callbackUrl="/creator/accounts" /> : status === 'authenticated' ? <AccountsContent /> : null}
    </CreatorShell>
  )
}

function AccountsContent() {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const [connectOpen, setConnectOpen] = useState(false)
  const [verificationAccount, setVerificationAccount] = useState<CreatorSocialAccount | null>(null)
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const accounts = useMemo(() => data?.socialAccounts || [], [data?.socialAccounts])
  const tiktokCount = accounts.filter((account) => account.platform === 'tiktok').length
  const instagramCount = accounts.filter((account) => account.platform === 'instagram').length
  const atLimit = accounts.length >= 10 || (platform === 'tiktok' ? tiktokCount : instagramCount) >= 5

  useEffect(() => {
    if (!router.isReady || typeof router.query.tiktok !== 'string') return
    const result = router.query.tiktok
    if (result === 'connected' || result === 'basic_connected') {
      toast.success('TikTok connected. Add analytics to verify it')
      void mutate()
    } else if (result === 'cancelled') {
      toast.error('TikTok connection was cancelled')
    } else if (result === 'not_configured') {
      toast.error('TikTok OAuth is not configured yet')
    } else if (result === 'profile_scope_required') {
      toast.error('TikTok profile permission is required to connect this account')
    } else if (result === 'invalid_state') {
      toast.error('TikTok connection expired. Please try again')
    } else if (result !== 'auth_required') {
      toast.error('Could not connect TikTok')
    }
    void router.replace('/creator/accounts', undefined, { shallow: true })
  }, [mutate, router])

  async function removeAccount(account: CreatorSocialAccount) {
    try {
      await apiRequest(`/api/creator/accounts?id=${encodeURIComponent(account.id)}`, { method: 'DELETE' })
      await mutate()
      toast.success(`${creatorAccountLabel(account)} removed`)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not remove account')
    }
  }

  return (
    <>
      <CreatorHeader eyebrow="Connected Channels" title="Accounts" description="Connect your publishing profiles and verify their audience." action={<Button className="h-11 rounded-full px-5" onClick={() => setConnectOpen(true)} disabled={accounts.length >= 10}><Plus />Connect Account</Button>} />
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-[#86868b]" /></div> : accounts.length ? <div className="grid gap-3">{accounts.map((account) => <ConnectedAccountCard key={account.id} account={account} onVerify={() => setVerificationAccount(account)} onRemove={() => void removeAccount(account)} />)}</div> : <div className="creator-surface grid min-h-72 place-items-center p-8 text-center"><div><CreatorIcon name="accounts" className="mx-auto size-20" /><h2 className="mt-4 text-sm font-semibold">No Creator Accounts Connected</h2><p className="mt-2 max-w-sm text-sm leading-6 text-[#6e6e73]">Add a TikTok or Instagram profile to begin the review process.</p><Button className="mt-6 h-10 rounded-full px-4" onClick={() => setConnectOpen(true)}>Connect Your First Account</Button></div></div>}
      <div className="mt-5 flex gap-4 text-sm text-zinc-500"><span>TikTok {tiktokCount}/5</span><span>Instagram {instagramCount}/5</span></div>
      <div className="mt-5"><AccountReviewNote /></div>
      <ConnectAccountDialog open={connectOpen} onOpenChange={setConnectOpen} platform={platform} onPlatformChange={setPlatform} disabled={atLimit} onConnected={async () => { await mutate(); setConnectOpen(false) }} counts={{ tiktok: tiktokCount, instagram: instagramCount }} />
      <AccountVerificationDialog account={verificationAccount} open={Boolean(verificationAccount)} onOpenChange={(open) => { if (!open) setVerificationAccount(null) }} onSubmitted={async () => { await mutate() }} />
    </>
  )
}

function ConnectAccountDialog({ open, onOpenChange, platform, onPlatformChange, disabled, onConnected, counts }: { open: boolean; onOpenChange: (open: boolean) => void; platform: 'tiktok' | 'instagram'; onPlatformChange: (platform: 'tiktok' | 'instagram') => void; disabled: boolean; onConnected: () => Promise<void>; counts: { tiktok: number; instagram: number } }) {
  const [handle, setHandle] = useState('')
  const [profileUrl, setProfileUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [connectingOauth, setConnectingOauth] = useState(false)

  useEffect(() => {
    if (open) return
    setHandle('')
    setProfileUrl('')
    setSaving(false)
    setConnectingOauth(false)
  }, [open])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (platform === 'tiktok') return
    const input = creatorSocialAccountSchema.safeParse({ platform, handle, profileUrl: profileUrl || null })
    if (!input.success) return toast.error(input.error.issues[0].message)
    setSaving(true)
    try {
      await apiPost('/api/creator/accounts', input.data)
      setHandle('')
      setProfileUrl('')
      await onConnected()
      toast.success('Instagram connected. Add analytics to verify it')
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not connect account')
    } finally { setSaving(false) }
  }

  async function connectTikTok() {
    setConnectingOauth(true)
    try {
      const { authorizeUrl } = await apiPost<{ authorizeUrl: string }>('/api/creator/oauth/tiktok/start', {})
      window.location.assign(authorizeUrl)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not start TikTok connection')
      setConnectingOauth(false)
    }
  }

  const busy = saving || connectingOauth

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen) }}>
      <DialogContent className="creator-dialog max-h-[90vh] max-w-lg overflow-y-auto rounded-[26px] border-white/70 bg-white/95 p-0">
        <form onSubmit={submit} className="grid gap-6 p-6 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-2xl">Connect an Account</DialogTitle>
            <DialogDescription>Connect your profile first. After it appears in Accounts, you’ll submit its analytics recording for verification.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(['tiktok', 'instagram'] as const).map((option) => (
              <button key={option} type="button" disabled={busy} onClick={() => onPlatformChange(option)} className={cn('flex items-center gap-2 rounded-[14px] border px-4 py-3 text-left text-sm font-medium capitalize transition-[border-color,background-color,box-shadow,transform] duration-150 active:scale-[0.98]', platform === option ? 'border-[#0071e3]/30 bg-[#e8f2ff] text-[#0071e3] shadow-[0_0_0_3px_rgba(0,113,227,0.06)]' : 'border-black/[0.08] bg-white hover:bg-[#f5f5f7]')}>
                <SocialPlatformLogo platform={option} className="size-5" />
                <span>{option}</span><span className={cn('ml-auto text-xs', platform === option ? 'text-[#0071e3]/60' : 'text-[#86868b]')}>{counts[option]}/5</span>
              </button>
            ))}
          </div>
          {disabled ? <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />You’ve reached the five-account limit for this platform.</div> : null}

          {platform === 'tiktok' ? (
            <div className="rounded-[18px] bg-[#f5f5f7] p-5 text-center">
              <span className="mx-auto grid size-12 place-items-center overflow-hidden rounded-[16px] bg-white shadow-sm"><SocialPlatformLogo platform="tiktok" className="size-9" /></span>
              <h3 className="mt-4 text-sm font-semibold">Connect With TikTok</h3>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-500">Log in with TikTok to connect your account. Analytics verification happens after connection.</p>
              <Button type="button" className="mt-5 h-11 w-full rounded-full" disabled={disabled || busy} onClick={() => void connectTikTok()}>{connectingOauth ? <Loader2 className="animate-spin" /> : <SocialPlatformLogo platform="tiktok" className="size-5" />}{connectingOauth ? 'Connecting…' : 'Continue With TikTok'}</Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400"><ShieldCheck className="size-3.5" />Secure OAuth · Profile and Engagement Statistics</p>
            </div>
          ) : (
            <>
              <Field label="Username"><div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">@</span><input className={cn(fieldClass, 'pl-8')} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="creatorname" required /></div></Field>
              <Field label="Profile URL" hint="Optional"><input className={fieldClass} type="url" value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://instagram.com/creatorname" /></Field>
              <Button className="h-11 rounded-full" disabled={disabled || busy}>{saving ? <Loader2 className="animate-spin" /> : <SocialPlatformLogo platform="instagram" className="size-5" />}{saving ? 'Connecting…' : 'Connect Instagram Account'}</Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConnectedAccountCard({ account, onVerify, onRemove }: { account: CreatorSocialAccount; onVerify: () => void; onRemove: () => void }) {
  const needsVerification = !account.analyticsConfirmedAt
  return (
    <article className="creator-surface p-4">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-start gap-3">
        <span className="grid size-11 place-items-center rounded-[14px] bg-[#f5f5f7]"><SocialPlatformLogo platform={account.platform} className="size-7" /></span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{creatorAccountLabel(account)}</p>
          <p className="mt-1 text-xs capitalize text-[#6e6e73]">{account.platform}</p>
          <p className="mt-1 flex items-center gap-1 text-xs font-medium text-[#248a3d]"><ShieldCheck className="size-3 shrink-0" />{account.connectionMethod === 'oauth' ? 'OAuth Connected' : 'Profile Connected'}</p>
        </div>
        <button type="button" onClick={onRemove} className="grid size-11 place-items-center rounded-full text-[#86868b] hover:bg-black/[0.05] hover:text-[#d70015]" aria-label={`Remove ${creatorAccountLabel(account)}`}><Trash2 className="size-4" /></button>
      </div>
      {account.reviewNote ? <p className="mt-3 break-words text-sm text-[#8a5a00]">{account.reviewNote}</p> : null}
      <div className="mt-4 grid justify-items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <AccountStatus status={account.status} needsVerification={needsVerification} />
        {needsVerification || account.status === 'missing_information' ? <Button type="button" className="h-11 w-full rounded-full px-4 sm:w-auto" onClick={onVerify}><ShieldCheck />{needsVerification ? 'Verify Account' : 'Update Verification'}</Button> : null}
      </div>
      <AccountTrackingLink url={account.trackingLink?.publicUrl} accountName={creatorAccountLabel(account)} avatarUrl={account.avatarUrl} className="mt-4" />
      <p className="mt-2 text-xs leading-5 text-[#86868b]">Use this account-specific link in {creatorAccountLabel(account)}’s bio. It works while verification is pending.</p>
    </article>
  )
}

function AccountStatus({ status, needsVerification }: { status: CreatorSocialAccount['status']; needsVerification: boolean }) {
  const label = needsVerification ? 'Needs Verification' : status === 'pending' ? 'Pending Review' : status === 'missing_information' ? 'Missing Information' : 'Approved'
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex', status === 'approved' && !needsVerification ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{status === 'approved' && !needsVerification ? <Check className="size-3" /> : <AlertCircle className="size-3" />}{label}</span>
}
