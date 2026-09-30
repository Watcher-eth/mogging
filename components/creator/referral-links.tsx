import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, Link2 } from 'lucide-react'
import { apiGet } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { AccountLink } from './account-link'
import { creatorAccountLabel, type CreatorDashboard } from './types'

export function CreatorReferralLinks() {
  const { data, error, isLoading, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const accounts = data?.socialAccounts ?? []

  return (
    <section id="referral-links" aria-labelledby="referral-links-title" className="creator-surface mb-5 border-[#0071e3]/20 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#0071e3]/10 text-[#0071e3]"><Link2 className="size-5" aria-hidden="true" /></span>
          <div><p className="text-xs font-semibold text-[#0071e3]">Share before you post</p><h2 id="referral-links-title" className="mt-1 text-xl font-semibold tracking-tight">Your referral links</h2></div>
        </div>
        {accounts.length ? <Link href="/creator/accounts" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-[#0071e3]">Manage accounts<ArrowRight className="size-4" /></Link> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-[#6e6e73]">Put your link in your bio or link-in-bio page and direct viewers there. Use the link for the account you post from so referrals are attributed to that account.</p>
      {isLoading ? <p role="status" className="mt-4 text-sm text-[#6e6e73]">Loading your referral links…</p> : error ? (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3"><p className="text-sm">We couldn’t load your links.</p><Button variant="outline" onClick={() => void mutate()}>Try again</Button></div>
      ) : accounts.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3">
          {accounts.map(account => <div key={account.id} className="min-w-0">
            {account.trackingLink?.isActive && account.trackingLink.publicUrl ? <AccountLink url={account.trackingLink.publicUrl} accountName={`${account.platform === 'tiktok' ? 'TikTok' : 'Instagram'} · ${creatorAccountLabel(account)}`} avatarUrl={account.avatarUrl} /> : <p className="rounded-xl bg-[#f5f5f7] p-4 text-sm">The link for {creatorAccountLabel(account)} isn’t available. <Link href="/creator/accounts" className="font-semibold text-[#0071e3] underline">Check this account</Link>.</p>}
          </div>)}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-[#f5f5f7] p-4">
          <p className="text-sm font-semibold">Your link is created automatically when you connect an account.</p>
          <p className="mt-1 text-sm leading-6 text-[#6e6e73]">Connect TikTok or Instagram once, then copy your link here. No separate link setup is needed.</p>
          <Button asChild className="mt-3 min-h-11 rounded-xl"><Link href="/creator/accounts">Connect an account<ArrowRight /></Link></Button>
        </div>
      )}
    </section>
  )
}
