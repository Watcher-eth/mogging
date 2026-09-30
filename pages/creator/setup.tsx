import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Clock3, Loader2 } from 'lucide-react'
import useSWR from 'swr'
import { toast } from 'sonner'
import { CreatorShell, CreatorHeader } from '@/components/creator/creator-shell'
import { CreatorStepper } from '@/components/creator/creator-stepper'
import { CreatorIcon } from '@/components/creator/creator-icon'
import { ConnectAccountForm } from '@/components/creator/connect-account-form'
import { AccountVerificationDialog } from '@/components/creator/account-verification-dialog'
import { PayoutInformation } from '@/components/creator/payout-information-form'
import type { CreatorDashboard } from '@/components/creator/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiGet, apiPatch } from '@/lib/api/client'

const labels: [string, string, string] = ['Connect account', 'Submit recording', 'Select payout method']
const descriptions = [
  'Connect with TikTok securely, or add your Instagram profile manually.',
  'Show your account’s audience analytics in one continuous physical recording.',
  'Choose where to receive your approved earnings. You can update this later.',
]

export default function CreatorSetupPage() {
  return <CreatorShell><SetupContent /></CreatorShell>
}

function SetupContent() {
  const router = useRouter()
  const { data: session } = useSession()
  const { data, error, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const [platform, setPlatform] = useState<'tiktok' | 'instagram'>('tiktok')
  const accounts = data?.socialAccounts || []
  const account = accounts.find((item) => item.id === router.query.account || item.id === router.query.verify) || accounts.find((item) => !item.analyticsConfirmedAt) || accounts[0]
  const step: 1 | 2 | 3 = !account || router.query.step === 'connect' ? 1 : !account.analyticsConfirmedAt || router.query.step === 'recording' ? 2 : 3
  const counts = { tiktok: accounts.filter((item) => item.platform === 'tiktok').length, instagram: accounts.filter((item) => item.platform === 'instagram').length }

  useEffect(() => {
    if (!router.isReady || typeof router.query.tiktok !== 'string') return
    const result = router.query.tiktok
    if (result !== 'connected' && result !== 'basic_connected') toast.error(result === 'cancelled' ? 'TikTok connection was cancelled. Please try again.' : 'Could not connect TikTok. Please try again.')
    const query: Record<string, string> = {}
    if (typeof router.query.verify === 'string') query.account = router.query.verify
    void router.replace({ pathname: '/creator/setup', query }, undefined, { shallow: true })
  }, [router])

  async function goToStep(next: 'connect' | 'recording' | 'payout', accountId = account?.id) {
    await router.push({ pathname: '/creator/setup', query: { step: next, ...(accountId ? { account: accountId } : {}) } })
  }

  function dismissWelcome() {
    const { welcome: _welcome, ...query } = router.query
    void router.replace({ pathname: '/creator/setup', query }, undefined, { shallow: true })
  }

  return <div className="creator-portal flex min-h-dvh flex-col bg-[#fafafa]">
    <header className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 sm:px-8">
      <Link href="/creator" className="flex min-h-11 items-center gap-2.5 text-sm font-semibold"><Image src="/favicon.png" width={32} height={32} alt="" className="rounded-[9px]" />Mogging <span className="font-normal text-[#86868b]">/ Creator setup</span></Link>
      <span className="text-xs font-medium text-[#86868b]">Step {step} of 3</span>
    </header>
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 sm:py-12">
      <CreatorStepper step={step} labels={labels} />
      <CreatorHeader eyebrow="Creator setup" title={labels[step - 1]} description={descriptions[step - 1]} />
      {!data ? <div role="status" className="grid min-h-64 place-items-center">{error ? <div className="text-center"><p className="text-sm text-[#6e6e73]">Could not load your setup.</p><Button className="mt-4 rounded-full" onClick={() => void mutate()}>Try again</Button></div> : <Loader2 aria-label="Loading setup" className="size-5 animate-spin" />}</div> : <>
        {step === 1 ? <div className="creator-surface"><ConnectAccountForm platform={platform} onPlatformChange={setPlatform} counts={counts} disabled={accounts.length >= 10 || counts[platform] >= 5} destination="setup" onConnected={async (connected) => { await mutate(); await goToStep('recording', connected.id) }} />{account ? <div className="border-t border-black/[0.06] p-6"><Button variant="outline" className="h-11 w-full rounded-full" onClick={() => void goToStep(account.analyticsConfirmedAt ? 'payout' : 'recording')}>Continue with connected account<ArrowRight /></Button></div> : null}</div> : null}
        {step === 2 && account ? <AccountVerificationDialog key={account.id} presentation="page" account={account} open onOpenChange={() => {}} onSubmitEvidence={async (evidence) => { await apiPatch('/api/creator/accounts', { accountId: account.id, ...evidence }); await mutate(); toast.success('Audience recording submitted for review'); await goToStep('payout') }} /> : null}
        {step === 3 ? <PayoutInformation email={session?.user?.email || ''} onSaved={async () => { await router.replace('/creator') }} /> : null}
        {step > 1 ? <Button variant="ghost" className="mt-6 h-11 rounded-full" onClick={() => void goToStep(step === 2 ? 'connect' : 'recording')}><ArrowLeft />{step === 2 ? 'Back to account' : 'Back to recording'}</Button> : null}
      </>}
    </main>
    <footer className="flex items-center justify-center gap-2 border-t border-black/[0.06] px-5 py-5 text-xs font-medium text-[#86868b]"><Clock3 className="size-4" />Takes less than 5 minutes</footer>
    <Dialog open={router.isReady && router.query.welcome === '1'} onOpenChange={(open) => { if (!open) dismissWelcome() }}>
      <DialogContent className="creator-dialog max-w-md overflow-hidden rounded-[28px] border-white/70 bg-white p-7 sm:p-9">
        <div className="flex justify-center gap-3 rounded-[22px] bg-[#f5f5f7] py-8" aria-hidden="true"><CreatorIcon name="accounts" className="size-16" /><CreatorIcon name="submissions" className="size-16" /><CreatorIcon name="payouts" className="size-16" /></div>
        <DialogHeader className="mt-3 text-center sm:text-center"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#86868b]">Welcome to Mogging Creators</p><DialogTitle className="text-[2rem] leading-tight tracking-[-0.05em]">Let’s get you set up.</DialogTitle><DialogDescription className="mt-2">Connect your account, submit your audience recording, and choose a payout method. Three simple steps, then you’re ready to go.</DialogDescription></DialogHeader>
        <p className="my-2 flex items-center justify-center gap-2 text-sm font-medium text-[#6e6e73]"><Clock3 className="size-4" />Setup takes less than 5 minutes</p>
        <Button className="h-12 w-full rounded-full" onClick={dismissWelcome}>Let’s get started<ArrowRight /></Button>
      </DialogContent>
    </Dialog>
  </div>
}
