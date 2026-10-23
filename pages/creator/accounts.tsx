import { followerLabel, tiktokAnchorEligible } from '@/lib/creator/tiktok-anchor'
import { TikTokAccountDialog } from '@/components/creator/tiktok-anchor-onboarding'
import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { useEffect, useState } from 'react'
import * as Avatar from '@radix-ui/react-avatar'
import { AnimatedGroup } from '@/components/core/animated-group'
import useSWR from 'swr'
import { ArrowUpRight, Check, CircleAlert, Clock3, Loader2, Plus, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CreatorHeader, CreatorShell } from '@/components/creator/creator-shell'
import { ConnectAccountForm } from '@/components/creator/connect-account-form'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import {
  creatorAccountLabel,
  type CreatorDashboard,
  type CreatorSocialAccount,
} from '@/components/creator/types'
import { CreatorReferralCode, CreatorReferralDetails } from '@/components/creator/referral-details'
import { apiGet, apiPost, apiRequest, ApiClientError } from '@/lib/api/client'
export default function CreatorAccountsPage() {
  return (
    <CreatorShell>
      <AccountsContent />
    </CreatorShell>
  )
}
function AccountsContent() {
  const { data, error, isLoading, mutate } = useSWR<CreatorDashboard>(
    '/api/creator',
    apiGet,
  )
  const profileId = data?.profile?.id
  useEffect(() => {
    if (!profileId) return
    let active = true
    const refresh = () => { void apiPost<{ accounts: Array<{ id: string; avatarUrl: string | null }> }>('/api/creator/account-avatars', {})
      .then(result => {
        if (!active) return
        const photos = new Map(result.accounts.map(account => [account.id, account.avatarUrl]))
        void mutate(current => current ? { ...current, socialAccounts: current.socialAccounts.map(account => ({ ...account, avatarUrl: photos.get(account.id) || account.avatarUrl })) } : current, { revalidate: false })
      }).catch(() => { /* Keep existing photos and initials when the provider is unavailable. */ }) }
    refresh()
    window.addEventListener('focus', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh) }
  }, [mutate, profileId])
  const [editing, setEditing] = useState<{ id: string; mode: 'followers' | 'anchor' } | null>(null)
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const accounts = data?.socialAccounts || []
  const editingAccount = accounts.find(account => account.id === editing?.id)
  const counts = {
    tiktok: accounts.filter((item) => item.platform === 'tiktok').length,
    instagram: accounts.filter((item) => item.platform === 'instagram').length,
  }
  async function remove(account: CreatorSocialAccount) {
    try {
      await apiRequest(`/api/creator/accounts?id=${account.id}`, {
        method: 'DELETE',
      })
      await mutate()
      toast.success('Account removed')
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Could not remove account',
      )
    }
  }
  return (
    <div className="px-4 md:pl-0 md:pr-6">
      <CreatorHeader
        eyebrow="Connected channels"
        title="Accounts"
        description="Connect your publishing profiles and share your referral links or codes."
        action={
          <Button
            onClick={() => setOpen(true)}
            disabled={accounts.length >= 10}
          >
            <Plus className="size-4" />
            Connect account
          </Button>
        }
      />
      {isLoading ? (
        <Loader2 className="mx-auto my-16 animate-spin" />
      ) : error ? (
        <p role="alert">
          Could not load accounts.{' '}
          <button onClick={() => void mutate()} className="text-[#00A8EF]">
            Try again
          </button>
        </p>
      ) : accounts.length ? (
        <AnimatedGroup preset="scale" className="grid items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {accounts.map((account) => (
            <article className="flex h-full min-w-0 flex-col rounded-[28px] border border-black/[0.06] bg-white p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02),0_12px_32px_-12px_rgba(0,0,0,0.12)] sm:p-6" key={account.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="relative shrink-0">
                  <Avatar.Root className="flex size-[72px] overflow-hidden rounded-full bg-[#f2f3f5] ring-1 ring-black/[0.04]">
                    <Avatar.Image src={account.avatarUrl || undefined} alt={`${creatorAccountLabel(account)} profile photo`} referrerPolicy="no-referrer" className="size-full object-cover" />
                    <Avatar.Fallback className="grid size-full place-items-center bg-gradient-to-b from-[#eaf3ff] to-[#dceaff] text-2xl font-medium text-[#5076a6]">
                      {(account.displayName || account.handle || account.platform).replace(/^@/, '').slice(0, 2).toUpperCase()}
                    </Avatar.Fallback>
                  </Avatar.Root>
                  <span className="absolute -bottom-1 -right-1 grid size-7 place-items-center overflow-hidden rounded-full bg-white ring-[3px] ring-white shadow-sm">
                    <SocialPlatformLogo platform={account.platform} className="!size-[18px]" />
                    <span className="sr-only">{account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</span>
                  </span>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${creatorAccountLabel(account)}`}
                  onClick={() => void remove(account)}
                  className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007aff]"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
              <div className="mb-5 mt-5 min-w-0">
                {account.profileUrl ? <a href={account.profileUrl} target="_blank" rel="noreferrer" className="group flex min-h-8 w-fit max-w-full items-center gap-1.5 rounded-md text-[19px] font-semibold tracking-[-0.035em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#007aff]">
                  <span className="truncate" title={creatorAccountLabel(account)}>{creatorAccountLabel(account)}</span>
                  <ArrowUpRight className="size-4 shrink-0 text-zinc-400 transition-colors group-hover:text-[#007aff]" />
                </a> : <h2 title={creatorAccountLabel(account)} className="truncate text-[19px] font-semibold tracking-[-0.035em]">{creatorAccountLabel(account)}</h2>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-zinc-500">{account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</span>
                  <span aria-hidden="true" className="text-zinc-300">·</span>
                  <span className={`inline-flex items-center gap-1 ${account.status === 'approved' ? 'text-[#248a3d]' : account.status === 'pending' ? 'text-zinc-500' : 'text-amber-700'}`}>
                    {account.status === 'approved' ? <Check className="size-3.5" /> : account.status === 'pending' ? <Clock3 className="size-3.5" /> : <CircleAlert className="size-3.5" />}
                    {account.status === 'approved' ? 'Connected' : account.status === 'pending' ? 'Pending review' : 'Needs information'}
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <div className="grid justify-items-start gap-1">
                  <span className="text-xs font-medium text-zinc-500">Your code</span>
                  {account.trackingLink ? <CreatorReferralCode trackingLink={account.trackingLink} /> : <span className="py-3 text-xs text-zinc-400">Not available yet</span>}
                </div>
                <CreatorReferralDetails trackingLink={account.trackingLink} />
              </div>
              {account.platform === 'tiktok' ? <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-zinc-500"><Users className="size-3.5" />{followerLabel(account.followers)}</span>
                <button className="min-h-11 font-medium text-[#008bc6]" onClick={() => setEditing({ id: account.id, mode: 'followers' })}>Update followers</button>
                {tiktokAnchorEligible(account) ? <button className="min-h-11 font-medium text-[#008bc6]" onClick={() => setEditing({ id: account.id, mode: 'anchor' })}>{account.tiktokAnchorJoinedAt ? 'View TikTok anchor setup' : 'Set up TikTok anchor'}</button> : null}
              </div> : null}
              {account.reviewNote && account.reviewNote !== 'Account ownership and audience analytics verified with our team on Discord.' ? (
                <p className="mt-3 text-sm text-zinc-500">
                  {account.reviewNote}
                </p>
              ) : null}
            </article>
          ))}
        </AnimatedGroup>
      ) : (
        <div className="creator-surface grid min-h-64 place-items-center p-8 text-center">
          <div>
            <h2 className="font-semibold">Your audience starts here</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Add a TikTok or Instagram handle to get your referral link and code.
            </p>
            <Button className="mt-5" onClick={() => setOpen(true)}>
              Connect your first account
            </Button>
          </div>
        </div>
      )}
      <p className="mt-5 text-xs text-zinc-500">
        TikTok {counts.tiktok}/5 · Instagram {counts.instagram}/5
      </p>
      {editingAccount && editing ? <TikTokAccountDialog key={`${editing.id}:${editing.mode}`} account={editingAccount} mode={editing.mode} open onOpenChange={value => { if (!value) setEditing(null) }} onSaved={() => mutate()} /> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="creator-dialog creator-dialog-flow p-0">
          <DialogHeader className="creator-dialog-header border-b p-6 text-left">
            <DialogTitle className="creator-dialog-title">Connect account</DialogTitle>
            <DialogDescription>
              Enter your Instagram username or TikTok handle.
            </DialogDescription>
          </DialogHeader>
          <AnimatedDialogPanel contentKey={platform}>
          <ConnectAccountForm
            platform={platform}
            onPlatformChange={setPlatform}
            counts={counts}
            disabled={accounts.length >= 10 || counts[platform] >= 5}
            onConnected={async () => {
              await mutate()
              setOpen(false)
            }}
          />
          </AnimatedDialogPanel>
        </DialogContent>
      </Dialog>
    </div>
  )
}
