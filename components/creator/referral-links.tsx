import Link from 'next/link'
import useSWR from 'swr'
import { ArrowRight, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { apiGet } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { CreatorIcon } from './creator-icon'
import { creatorAccountLabel, type CreatorDashboard } from './types'
import { referralCode } from '@/lib/creator/sprints'
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
              Your referral codes
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
        Use the code for the account you post from in your caption.
        Existing referral links continue to work.
      </p>
      {isLoading ? (
        <p className="mt-4 text-sm text-zinc-500">Loading your codes…</p>
      ) : error ? (
        <Button onClick={() => void mutate()} variant="outline">
          Try again
        </Button>
      ) : accounts.length ? (
        <div className="mt-4 grid gap-3">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-[#f5f6f7] p-4"
            >
              <div className="min-w-0">
                <p className="text-xs text-zinc-500">
                  {creatorAccountLabel(account)} ·{' '}
                  {account.platform === 'tiktok' ? 'TikTok' : 'Instagram'}
                </p>
                <code className="break-all text-sm">
                  {referralCode(account.trackingLink) || 'Code unavailable'}
                </code>
              </div>
              <button
                aria-label="Copy referral code"
                disabled={!account.trackingLink?.isActive}
                className="grid size-11 shrink-0 place-items-center text-[#00A8EF]"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      referralCode(account.trackingLink) || '',
                    )
                    toast.success('Code copied')
                  } catch {
                    toast.error('Select and copy your code')
                  }
                }}
              >
                <Copy className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-[#f5f6f7] p-4">
          <p className="text-sm font-semibold">
            Get your code when you connect an account.
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            Add a TikTok or Instagram handle, then copy your permanent code.
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
