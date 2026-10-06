import { AnimatedDialogPanel } from '@/components/ui/animated-dialog-panel'
import { useState } from 'react'
import useSWR from 'swr'
import { Loader2, Plus, Trash2 } from 'lucide-react'
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
import { apiGet, apiRequest, ApiClientError } from '@/lib/api/client'
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
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const accounts = data?.socialAccounts || []
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
    <>
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
        <div className="grid gap-3">
          {accounts.map((account) => (
            <article className="creator-surface p-5" key={account.id}>
              <div className="flex flex-wrap items-center gap-3">
                <SocialPlatformLogo
                  platform={account.platform}
                  className="size-9"
                />
                <div className="min-w-0 flex-1 basis-[140px]">
                  <a
                    href={account.profileUrl || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold"
                  >
                    {creatorAccountLabel(account)}
                  </a>
                  <p className="text-xs capitalize text-zinc-500">
                    {account.platform} · Connected
                  </p>
                </div>
                <div className="ml-auto flex min-w-0 max-w-full items-center gap-1">
                  <CreatorReferralCode trackingLink={account.trackingLink} />
                  <button
                    aria-label={`Remove ${creatorAccountLabel(account)}`}
                    onClick={() => void remove(account)}
                    className="grid size-11 shrink-0 place-items-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-[#F33232]"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <CreatorReferralDetails trackingLink={account.trackingLink} />
              </div>
              {account.reviewNote && account.reviewNote !== 'Account ownership and audience analytics verified with our team on Discord.' ? (
                <p className="mt-3 text-sm text-zinc-500">
                  {account.reviewNote}
                </p>
              ) : null}
            </article>
          ))}
        </div>
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="creator-dialog p-0">
          <DialogHeader className="border-b p-6 text-left">
            <DialogTitle>Connect account</DialogTitle>
            <DialogDescription>
              Enter your handle or profile URL.
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
    </>
  )
}
