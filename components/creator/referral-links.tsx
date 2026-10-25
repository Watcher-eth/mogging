import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, Link2, Ticket, Send } from 'lucide-react'
import { apiGet } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { creatorAccountLabel, type CreatorDashboard } from './types'
import { CreatorReferralCode, CreatorReferralDetails } from './referral-details'

export function CreatorReferralLinks() {
  const { data, error, isLoading, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const accounts = data?.socialAccounts ?? []

  return (
    <section id="referral-links" aria-labelledby="referral-links-title" className="min-w-0">
      <div className="mb-8 grid gap-6 rounded-[24px] bg-[#181a1d] p-5 text-white sm:grid-cols-3 sm:p-7">
        {[
          { icon: Link2, title: 'Link in your bio', detail: 'Give viewers a direct path to Mogging. You can also share it in messages.' },
          { icon: Ticket, title: 'Code in your caption', detail: 'Your code gives new subscribers 10% off their first month.' },
          { icon: Send, title: 'Reuse on every post', detail: 'Keep using the same account’s link and code. No separate post setup.' },
        ].map(({ icon: Icon, title, detail }) => <div key={title}><Icon className="mb-4 size-5 text-[#8edbff]" aria-hidden="true" /><h2 className="text-sm font-medium">{title}</h2><p className="mt-2 text-xs leading-5 text-white/60">{detail}</p></div>)}
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 id="referral-links-title" className="text-lg font-semibold tracking-tight">Your accounts</h2>
        <Link href="/creator/accounts" className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-[#008bc6]">Manage accounts<ArrowRight className="size-3.5" /></Link>
      </div>
      {isLoading ? <p className="rounded-2xl bg-[#f5f6f7] p-5 text-sm text-[#73777d]" role="status">Loading your referrals…</p>
        : error ? <div className="rounded-2xl border border-[#e7e9ec] p-5"><p className="mb-3 text-sm text-[#73777d]" role="alert">Your referral links couldn’t load. Try again.</p><Button onClick={() => void mutate()} variant="outline">Try again</Button></div>
        : accounts.length ? <div className="grid gap-4 lg:grid-cols-2">{accounts.map((account) => (
          <article key={account.id} className="min-w-0 overflow-hidden rounded-[20px] border border-[#e7e9ec] bg-white">
            <div className="flex flex-wrap items-center justify-between gap-x-3 border-b border-[#eceef0] px-5 py-3">
              <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f5f6f7]"><SocialPlatformLogo platform={account.platform} className="size-4" /></span><div className="min-w-0"><h3 className="break-all text-sm font-semibold">{creatorAccountLabel(account)}</h3><p className="text-xs text-[#858a91]">{account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}</p></div></div>
              <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-wide text-[#858a91]">Code</span><CreatorReferralCode trackingLink={account.trackingLink} /></div>
            </div>
            <div className="px-5 pb-5 pt-2">{account.trackingLink && !account.trackingLink.isActive ? <p className="mb-2 text-xs text-[#a65c19]">This referral link is inactive.</p> : null}<CreatorReferralDetails trackingLink={account.trackingLink} /></div>
          </article>
        ))}</div>
          : <div className="rounded-[20px] border border-dashed border-[#d8dce0] bg-[#fafbfc] p-7 text-center"><Link2 className="mx-auto mb-4 size-6 text-[#00A8EF]" aria-hidden="true" /><h3 className="text-base font-semibold">Your first referral starts with an account.</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#73777d]">Add your TikTok or Instagram handle to get a permanent link and code.</p><Button asChild className="mt-5"><Link href="/creator/accounts">Add an account<ArrowRight /></Link></Button></div>}
      <p className="mt-5 text-xs leading-5 text-[#858a91]">Your code gives new subscribers 10% off their first month</p>
    </section>
  )
}
