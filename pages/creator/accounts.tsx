import { ConnectAccountForm } from '@/components/creator/connect-account-form'
import * as Avatar from '@radix-ui/react-avatar'
import { creatorAccountLabel } from '@/components/creator/types'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { AlertCircle, Check, Loader2, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CreatorAuthPrompt } from '@/components/creator/creator-auth-prompt'
import { AccountVerificationDialog } from '@/components/creator/account-verification-dialog'
import { AccountLink } from '@/components/creator/account-link'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { CreatorIcon } from '@/components/creator/creator-icon'
import { AccountReviewNote } from '@/components/creator/content-guidelines'
import type { CreatorDashboard, CreatorSocialAccount } from '@/components/creator/types'
import { apiGet, apiPatch, apiRequest, ApiClientError } from '@/lib/api/client'
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
    if (!router.isReady) return
    const result = router.query.tiktok
    const accountId = router.query.verify
    if (typeof result !== 'string' && typeof accountId !== 'string') return
    if (typeof accountId === 'string' && !data) return
    if (result === 'connected' || result === 'basic_connected') {
      toast.success('TikTok connected. Upload your audience recording to finish verification.')
    } else if (result === 'cancelled') {
      toast.error('TikTok connection was cancelled')
    } else if (result === 'not_configured') {
      toast.error('TikTok connection is not available yet')
    } else if (result === 'invalid_state') {
      toast.error('TikTok connection expired. Please try again')
    } else if (typeof result === 'string') {
      toast.error('Could not connect TikTok. Please try again.')
    }
    const account = accounts.find((item) => item.id === accountId)
    if (account) setVerificationAccount(account)
    void router.replace('/creator/accounts', undefined, { shallow: true })
  }, [accounts, data, router])

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
      {isLoading ? <div className="grid min-h-64 place-items-center"><Loader2 className="size-5 animate-spin text-[#858a91]" /></div> : accounts.length ? <div className="grid gap-3">{accounts.map((account) => <ConnectedAccountCard key={account.id} account={account} onVerify={() => setVerificationAccount(account)} onRemove={() => void removeAccount(account)} />)}</div> : <div className="creator-surface grid min-h-72 place-items-center p-8 text-center"><div><CreatorIcon name="accounts" className="mx-auto size-20" /><h2 className="mt-4 text-sm font-semibold">No Creator Accounts Connected</h2><p className="mt-0.5 max-w-sm text-sm leading-6 text-[#73777d]">Add a TikTok or Instagram profile to begin the review process.</p><Button className="mt-6 h-10 rounded-full px-4" onClick={() => setConnectOpen(true)}>Connect Your First Account</Button></div></div>}
      <div className="mt-5 flex gap-4 text-sm text-zinc-500"><span>TikTok {tiktokCount}/5</span><span>Instagram {instagramCount}/5</span></div>
      <div className="mt-5"><AccountReviewNote /></div>
      <ConnectAccountDialog open={connectOpen} onOpenChange={setConnectOpen} platform={platform} onPlatformChange={setPlatform} disabled={atLimit} onConnected={async (account) => { await mutate(); setConnectOpen(false); setVerificationAccount(account) }} counts={{ tiktok: tiktokCount, instagram: instagramCount }} />
      <AccountVerificationDialog account={verificationAccount} open={Boolean(verificationAccount)} onOpenChange={(open) => { if (!open) setVerificationAccount(null) }} onSubmitEvidence={async (evidence) => { if (!verificationAccount) return; await apiPatch('/api/creator/accounts', { accountId: verificationAccount.id, ...evidence }); await mutate(); toast.success('Audience recording submitted for review') }} />
    </>
  )
}

function ConnectAccountDialog({ open, onOpenChange, platform, onPlatformChange, disabled, onConnected, counts }: { open: boolean; onOpenChange: (open: boolean) => void; platform: 'tiktok' | 'instagram'; onPlatformChange: (platform: 'tiktok' | 'instagram') => void; disabled: boolean; onConnected: (account: CreatorSocialAccount) => Promise<void>; counts: { tiktok: number; instagram: number } }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="creator-dialog max-h-[90vh] max-w-lg overflow-y-auto rounded-[26px] border-zinc-200 bg-white p-0"><DialogHeader className="px-6 pt-6"><DialogTitle className="text-2xl">Connect an Account</DialogTitle><DialogDescription>Connect your profile, then upload your audience recording for review.</DialogDescription></DialogHeader>{open ? <ConnectAccountForm platform={platform} onPlatformChange={onPlatformChange} disabled={disabled} onConnected={onConnected} counts={counts} /> : null}</DialogContent></Dialog>
}

function ConnectedAccountCard({ account, onVerify, onRemove }: { account: CreatorSocialAccount; onVerify: () => void; onRemove: () => void }) {
  const needsVerification = !account.analyticsConfirmedAt
  const accountName = creatorAccountLabel(account)
  const profileUrl = account.profileUrl || (account.handle ? `https://www.${account.platform}.com/${account.platform === 'tiktok' ? '@' : ''}${account.handle}` : null)
  return (
    <article className="creator-surface p-4">
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-start gap-3">
        <Avatar.Root className="grid size-11 overflow-hidden rounded-full bg-[#f7f8f9]">
          <Avatar.Image src={account.avatarUrl || undefined} alt={`${accountName} profile photo`} className="size-full object-cover" />
          <Avatar.Fallback className="grid size-full place-items-center text-sm font-semibold text-[#73777d]">{accountName.replace(/^@/, '').charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar.Root>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-5">{accountName}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-4">
            <span className="text-[#73777d]">{account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</span>
            <span className="inline-flex items-center gap-1 font-medium text-[#29CE53]"><ShieldCheck className="size-3 shrink-0" />{account.connectionMethod === 'oauth' ? 'OAuth Connected' : 'Profile Connected'}</span>
          </div>
        </div>
        <button type="button" onClick={onRemove} className="grid size-11 place-items-center rounded-full text-[#858a91] hover:bg-black/[0.05] hover:text-[#F33232]" aria-label={`Remove ${creatorAccountLabel(account)}`}><Trash2 className="size-4" /></button>
      </div>
      {account.reviewNote ? <p className="mt-3 break-words text-sm text-[#52565c]">{account.reviewNote}</p> : null}
      <div className="mt-4 grid justify-items-start gap-3 sm:flex sm:items-center sm:justify-between">
        <AccountStatus status={account.status} needsVerification={needsVerification} />
        {needsVerification || account.status === 'missing_information' ? <Button type="button" className="h-11 w-full rounded-full px-4 sm:w-auto" onClick={onVerify}><ShieldCheck />{needsVerification ? 'Verify Account' : 'Update Verification'}</Button> : null}
      </div>
      <AccountLink url={profileUrl} accountName={accountName} avatarUrl={account.avatarUrl} emptyMessage="Profile URL unavailable" className="mt-4" />
    </article>
  )
}

function AccountStatus({ status, needsVerification }: { status: CreatorSocialAccount['status']; needsVerification: boolean }) {
  const label = needsVerification ? 'Needs Verification' : status === 'pending' ? 'Pending Review' : status === 'missing_information' ? 'Missing Information' : 'Approved'
  return <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:flex', status === 'approved' && !needsVerification ? 'creator-tone-green text-zinc-700' : 'bg-zinc-100 text-zinc-600')}>{status === 'approved' && !needsVerification ? <Check className="size-3" /> : <AlertCircle className="size-3" />}{label}</span>
}
