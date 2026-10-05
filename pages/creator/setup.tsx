import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useState } from 'react'
import { ArrowRight, Clock3, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { CreatorShell, CreatorHeader } from '@/components/creator/creator-shell'
import { ConnectAccountForm } from '@/components/creator/connect-account-form'
import { PayoutInformation } from '@/components/creator/payout-information-form'
import type { CreatorDashboard } from '@/components/creator/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { apiGet } from '@/lib/api/client'
export default function CreatorSetupPage() {
  return (
    <CreatorShell>
      <SetupContent />
    </CreatorShell>
  )
}
function SetupContent() {
  const router = useRouter()
  const { data: session } = useSession()
  const { data, error, mutate } = useSWR<CreatorDashboard>(
    '/api/creator',
    apiGet,
  )
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const accounts = data?.socialAccounts || []
  const payout = accounts.length > 0 && router.query.step !== 'connect'
  const counts = {
    tiktok: accounts.filter((item) => item.platform === 'tiktok').length,
    instagram: accounts.filter((item) => item.platform === 'instagram').length,
  }
  const dismiss = () => {
    const { welcome: _, ...query } = router.query
    void router.replace({ pathname: '/creator/setup', query }, undefined, {
      shallow: true,
    })
  }
  return (
    <div className="creator-portal flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b p-5">
        <Link
          href="/creator"
          className="flex items-center gap-3 text-sm font-semibold"
        >
          <Image
            src="/favicon.png"
            width={32}
            height={32}
            alt=""
            className="rounded-lg"
          />
          Creator Studio
        </Link>
        <span className="text-xs text-zinc-500">
          Step {payout ? 2 : 1} of 2
        </span>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <CreatorHeader
          eyebrow="Creator setup"
          title={payout ? 'Select payout method' : 'Connect account'}
          description={
            payout
              ? 'Choose where to receive your approved earnings.'
              : 'Enter your TikTok or Instagram handle to get your referral link and code.'
          }
        />
        {!data ? (
          <div className="grid min-h-64 place-items-center">
            {error ? (
              <Button onClick={() => void mutate()}>Try again</Button>
            ) : (
              <Loader2 className="animate-spin" />
            )}
          </div>
        ) : payout ? (
          <>
            <PayoutInformation
              email={session?.user?.email || ''}
              onSaved={async () => {
                await router.replace('/creator')
              }}
            />
            <Button
              variant="ghost"
              className="mt-5"
              onClick={() => void router.replace('/creator')}
            >
              Set up later
              <ArrowRight />
            </Button>
          </>
        ) : (
          <div className="creator-surface">
            <ConnectAccountForm
              platform={platform}
              onPlatformChange={setPlatform}
              counts={counts}
              disabled={accounts.length >= 10 || counts[platform] >= 5}
              onConnected={async () => {
                await mutate()
                await router.replace('/creator/setup?step=payout')
              }}
            />
            {accounts.length ? (
              <Button
                className="m-6"
                variant="outline"
                onClick={() =>
                  void router.replace('/creator/setup?step=payout')
                }
              >
                Use connected account
                <ArrowRight />
              </Button>
            ) : null}
          </div>
        )}
      </main>
      <footer className="flex justify-center gap-2 border-t p-5 text-xs text-zinc-500">
        <Clock3 className="size-4" />
        Takes less than 5 minutes
      </footer>
      <Dialog
        open={router.isReady && router.query.welcome === '1'}
        onOpenChange={(open) => {
          if (!open) dismiss()
        }}
      >
        <DialogContent className="creator-dialog p-8">
          <DialogHeader>
            <DialogTitle>Let’s get you set up.</DialogTitle>
            <DialogDescription>
              Connect your account, get your referral link and code, and choose a payout
              method. Setup takes less than 5 minutes.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={dismiss}>
            Let’s get started
            <ArrowRight />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
