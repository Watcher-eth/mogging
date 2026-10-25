import { useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { tiktokAnchorEligible } from '@/lib/creator/tiktok-anchor'
import type { CreatorSocialAccount } from './types'
import { TikTokAccountDialog } from './tiktok-anchor-onboarding'
import { VideoSubmissionAnimation } from './video-submission-animation'
import { AnchorEarningsAnimation } from './anchor-earnings-animation'

export function CreatorNextStep({ accounts, hasSubmitted, onAccountSaved }: { accounts: CreatorSocialAccount[]; hasSubmitted: boolean; onAccountSaved: () => Promise<unknown> }) {
  const eligible = accounts.filter(account => tiktokAnchorEligible(account) === true)
  const anchorAccount = eligible.find(account => !account.tiktokAnchorJoinedAt) || eligible[0]
  const [setupAccountId, setSetupAccountId] = useState<string | null>(null)
  const setupAccount = accounts.find(account => account.id === setupAccountId)
  const actionClass = 'group mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[#00A8EF]'
  return <>
    <section className="creator-next-step mb-7 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]">{anchorAccount ? 'TikTok · 1K+ followers' : 'Next Up'}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em]">{anchorAccount ? 'Earn more with TikTok anchors' : hasSubmitted ? 'Submit your next video' : 'Submit your first video'}</h2>
        <p className="mt-1 max-w-md text-sm leading-6 text-[#73777d]">{anchorAccount ? 'Give viewers a direct link to Mogging. Earn bonuses on qualifying conversions.' : 'Choose a campaign and share your published post with analytics evidence.'}</p>
        {anchorAccount ? <button type="button" onClick={() => setSetupAccountId(anchorAccount.id)} className={actionClass}>{anchorAccount.tiktokAnchorJoinedAt ? 'View anchor setup' : 'Set up TikTok anchors'}<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" /></button> : <Link href="/creator/submissions?new=1" className={actionClass}>Continue<ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" /></Link>}
      </div>
      <div className="flex justify-center sm:block">{anchorAccount ? <AnchorEarningsAnimation /> : <VideoSubmissionAnimation />}</div>
    </section>
    {setupAccount ? <TikTokAccountDialog key={setupAccount.id} account={setupAccount} mode="anchor" open onOpenChange={open => { if (!open) setSetupAccountId(null) }} onSaved={onAccountSaved} /> : null}
  </>
}
