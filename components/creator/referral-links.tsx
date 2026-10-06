import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight } from 'lucide-react'
import { apiGet } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { CreatorIcon } from './creator-icon'
import { creatorAccountLabel, type CreatorDashboard } from './types'
import { CreatorReferralCode, CreatorReferralDetails } from './referral-details'
export function CreatorReferralLinks() {
  const { data, error, isLoading, mutate } = useSWR<CreatorDashboard>(
    '/api/creator',
    apiGet,
  )
  const accounts = data?.socialAccounts || []
  return (
    <section
      id="referral-links"
      aria-labelledby="referral-links-title"
      className="mb-5 min-w-0"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CreatorIcon name="link" className="size-11" />
          <div>
            <p className="text-xs font-semibold text-[#00A8EF]">
              Share before you post
            </p>
            <h2
              id="referral-links-title"
              className="text-xl font-semibold tracking-tight"
            >
              Your referral links & codes
            </h2>
          </div>
        </div>
        {accounts.length ? (
          <Link
            href="/creator/accounts"
            className="inline-flex min-h-11 items-center gap-1 text-sm text-[#00A8EF]"
          >
            Manage accounts
            <ArrowRight className="size-4" />
          </Link>
        ) : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-500">
        Share your link in your bio or messages, or use your code in captions.
        Choose the account you post from so referrals reach the right account.
      </p>
      {isLoading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading your referrals…</p>
      ) : error ? (
        <Button onClick={() => void mutate()} variant="outline">
          Try again
        </Button>
      ) : accounts.length ? (
        <div className="mt-4 grid gap-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="min-w-0"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-zinc-500">
                  {creatorAccountLabel(account)} ·{' '}
                  {account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}
                </p>
                <CreatorReferralCode trackingLink={account.trackingLink} />
              </div>
              <CreatorReferralDetails trackingLink={account.trackingLink} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-[#f5f6f7] p-4">
          <p className="text-sm font-semibold">
            Get your link and code when you connect an account.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Add a TikTok or Instagram handle, then copy your permanent link or code.
          </p>
          <Button asChild className="mt-3">
            <Link href="/creator/accounts">
              Connect an account
              <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </section>
  )
}
