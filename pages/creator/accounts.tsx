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
import { CreatorHeader, CreatorShell, Field, fieldClass } from '@/components/creator/creator-shell'
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
    if (result === 'connected') {
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
      toast.success(`@${account.handle} removed`)
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : 'Could not remove account')
    }
  }

  return (
    <>
      <CreatorHeader eyebrow="Connected Channels" title="Accounts" description="Connect the TikTok and Instagram profiles you use for Mogging content. Each account is reviewed before it becomes eligible for submissions." action={<Button className="h-10 rounded-xl" onClick={() => setConnectOpen(true)} disabled={accounts.length >= 10}><Plus />Connect Account</Button>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <AccountLimitCard platform="TikTok" count={tiktokCount} />
        <AccountLimitCard platform="Instagram" count={instagramCount} />
      </div>
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-zinc-400" /></div> : accounts.length ? <div className="grid gap-3">{accounts.map((account) => <ConnectedAccountCard key={account.id} account={account} onVerify={() => setVerificationAccount(account)} onRemove={() => void removeAccount(account)} />)}</div> : <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-zinc-300 bg-white p-8 text-center"><div><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-zinc-100"><Plus className="size-5" /></span><h2 className="mt-4 text-sm font-semibold">No Creator Accounts Connected</h2><p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">Add a TikTok or Instagram profile to begin the review process.</p><Button className="mt-6 h-10 rounded-xl" onClick={() => setConnectOpen(true)}>Connect Your First Account</Button></div></div>}
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
    setSaving(true)
    try {
      await apiPost('/api/creator/accounts', { platform, handle, profileUrl: profileUrl || null })
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
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto rounded-[28px] border-zinc-200 bg-white p-0">
        <form onSubmit={submit} className="grid gap-6 p-6 sm:p-7">
          <DialogHeader>
            <DialogTitle className="text-2xl">Connect an Account</DialogTitle>
            <DialogDescription>Connect your profile first. After it appears in Accounts, you’ll submit its analytics recording for verification.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {(['tiktok', 'instagram'] as const).map((option) => (
              <button key={option} type="button" disabled={busy} onClick={() => onPlatformChange(option)} className={cn('rounded-xl border px-4 py-3 text-left text-sm font-medium capitalize transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.98]', platform === option ? 'border-black bg-black text-white' : 'border-zinc-200 bg-white hover:bg-zinc-50')}>
                {option}<span className={cn('ml-2 text-xs', platform === option ? 'text-white/60' : 'text-zinc-400')}>{counts[option]}/5</span>
              </button>
            ))}
          </div>
          {disabled ? <div className="flex gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800"><AlertCircle className="mt-0.5 size-4 shrink-0" />You’ve reached the five-account limit for this platform.</div> : null}

          {platform === 'tiktok' ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-black text-white"><TikTokMark /></span>
              <h3 className="mt-4 text-sm font-semibold">Connect With TikTok</h3>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-zinc-500">Log in with TikTok to connect your username and public profile. Analytics verification happens after connection.</p>
              <Button type="button" className="mt-5 h-11 w-full rounded-xl" disabled={disabled || busy} onClick={() => void connectTikTok()}>{connectingOauth ? <Loader2 className="animate-spin" /> : <TikTokMark />}{connectingOauth ? 'Connecting…' : 'Continue With TikTok'}</Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400"><ShieldCheck className="size-3.5" />Secure OAuth · Username and Profile Access Only</p>
            </div>
          ) : (
            <>
              <Field label="Username"><div className="relative"><span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-zinc-400">@</span><input className={cn(fieldClass, 'pl-8')} value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="creatorname" required /></div></Field>
              <Field label="Profile URL" hint="Optional"><input className={fieldClass} type="url" value={profileUrl} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://instagram.com/creatorname" /></Field>
              <Button className="h-11 rounded-xl" disabled={disabled || busy}>{saving ? <Loader2 className="animate-spin" /> : <InstagramMark />}{saving ? 'Connecting…' : 'Connect Instagram Account'}</Button>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConnectedAccountCard({ account, onVerify, onRemove }: { account: CreatorSocialAccount; onVerify: () => void; onRemove: () => void }) {
  const needsVerification = !account.analyticsConfirmedAt
  return <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,0.035)] sm:flex-row sm:items-center"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-zinc-100">{account.platform === 'instagram' ? <InstagramMark /> : <TikTokMark />}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">@{account.handle}</p><p className="mt-1 flex items-center gap-2 text-xs capitalize text-zinc-500"><span>{account.platform}</span>{account.connectionMethod === 'oauth' ? <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><ShieldCheck className="size-3" />OAuth Connected</span> : <span className="font-medium text-zinc-500">Profile Connected</span>}</p>{account.reviewNote ? <p className="mt-2 text-xs text-amber-700">{account.reviewNote}</p> : null}</div><div className="flex items-center gap-2"><AccountStatus status={account.status} needsVerification={needsVerification} />{needsVerification || account.status === 'missing_information' ? <Button type="button" className="h-9 rounded-xl" onClick={onVerify}><ShieldCheck />{needsVerification ? 'Verify Account' : 'Update Verification'}</Button> : null}<button type="button" onClick={onRemove} className="grid size-9 shrink-0 place-items-center rounded-full text-zinc-400 transition-[background-color,color,transform] duration-150 ease-out hover:bg-zinc-100 hover:text-black active:scale-[0.96]" aria-label={`Remove @${account.handle}`}><Trash2 className="size-4" /></button></div></div>
}

function AccountStatus({ status, needsVerification }: { status: CreatorSocialAccount['status']; needsVerification: boolean }) {
  const label = needsVerification ? 'Needs Verification' : status === 'pending' ? 'Pending Review' : status === 'missing_information' ? 'Missing Information' : 'Approved'
  return <span className={cn('hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex', status === 'approved' && !needsVerification && 'bg-emerald-50 text-emerald-700', status === 'pending' && !needsVerification && 'bg-amber-50 text-amber-700', (status === 'missing_information' || needsVerification) && 'bg-red-50 text-red-700')}>{status === 'approved' && !needsVerification ? <Check className="size-3" /> : <AlertCircle className="size-3" />}{label}</span>
}

function AccountLimitCard({ platform, count }: { platform: string; count: number }) { return <div className="rounded-2xl border border-zinc-200 bg-white p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium">{platform} Accounts</p><span className="text-xs font-semibold text-zinc-500">{count} / 5</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100"><div className="h-full rounded-full bg-black transition-transform duration-200 ease-out" style={{ transform: `scaleX(${count / 5})`, transformOrigin: 'left' }} /></div></div> }
function TikTokMark() { return <span className="text-sm font-black tracking-[-0.08em]">♪</span> }
function InstagramMark() { return <span className="grid size-5 place-items-center rounded-[6px] border-2 border-current text-[10px] leading-none">●</span> }
