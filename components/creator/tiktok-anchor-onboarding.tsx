import Image from 'next/image'
import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ArrowUpRight, Check, Copy, Link2, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiGet, apiPatch } from '@/lib/api/client'
import {
  FOLLOWER_RANGES,
  tiktokAnchorEligible,
  TIKTOK_ANCHOR_INVITE,
  type FollowerRange,
} from '@/lib/creator/tiktok-anchor'
import {
  creatorAccountLabel,
  type CreatorDashboard,
  type CreatorSocialAccount,
} from './types'
import { discordContactUrl } from './content-guidelines'

export function FollowerRangeSelect({
  value,
  onChange,
  id,
}: {
  value: FollowerRange | ''
  onChange: (value: FollowerRange) => void
  id: string
}) {
  return (
    <label
      htmlFor={id}
      className="grid gap-2 text-xs font-semibold text-zinc-600"
    >
      TikTok followers
      <select
        id={id}
        required
        className="creator-field"
        value={value}
        onChange={(event) => onChange(event.target.value as FollowerRange)}
      >
        <option value="" disabled>
          Select your follower range
        </option>
        {FOLLOWER_RANGES.map((range) => (
          <option key={range.value} value={range.value}>
            {range.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TikTokAccountDialog({
  account,
  mode,
  open,
  onOpenChange,
  onSaved,
}: {
  account: CreatorSocialAccount
  mode: 'followers' | 'anchor'
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<unknown>
}) {
  const [range, setRange] = useState<FollowerRange | ''>(
    account.followers?.source === 'self_reported' ? account.followers.range : ''
  )
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function save() {
    setBusy(true)
    setError('')
    try {
      await apiPatch(
        `/api/creator/accounts/${account.id}/tiktok-anchor`,
        mode === 'followers'
          ? { action: 'followers', range }
          : { action: 'joined', confirmed }
      )
      await onSaved()
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(TIKTOK_ANCHOR_INVITE)
      toast.success('Invitation link copied')
    } catch {
      toast.error('Use Open in TikTok to open the invitation')
    }
  }
  const followers = mode === 'followers'
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value)
      }}
    >
      <DialogContent
        className={`creator-dialog flex max-h-[90dvh] flex-col gap-0 overflow-hidden border-zinc-100 bg-white p-0 ${followers ? 'max-w-[440px]' : 'max-w-[700px]'}`}
      >
        <DialogHeader className="creator-dialog-header shrink-0 px-6 pb-4 pt-6 text-left sm:px-8">
          <div className="mb-2 flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-xl bg-[#eaf7fd] text-[#00A8EF]">
              {followers ? (
                <Users className="size-4" />
              ) : (
                <Link2 className="size-4" />
              )}
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
              {followers
                ? 'One quick account update'
                : 'Optional for TikTok · 1K+ followers'}
            </p>
          </div>
          <DialogTitle className="creator-dialog-title pr-5 text-[27px] font-semibold leading-tight tracking-[-0.04em]">
            {followers
              ? 'How many followers do you have?'
              : 'Your video. A direct link to Mogging.'}
          </DialogTitle>
          <DialogDescription className="pt-1 text-sm leading-6">
            {followers ? (
              <>
                Confirm the range for{' '}
                <strong className="font-medium text-zinc-700">
                  {creatorAccountLabel(account)}
                </strong>
                . This helps us show optional app anchors for eligible TikTok accounts.
              </>
            ) : (
              <>
                Give viewers a direct link to Mogging to help improve conversions.
                This is optional and never required to post, submit, or earn.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-4 sm:px-8">
          {followers ? (
            <div className="pt-3">
              <FollowerRangeSelect
                id={`followers-${account.id}`}
                value={range}
                onChange={setRange}
              />
              <p className="mt-2 text-xs leading-5 text-zinc-400">
                We check TikTok when available. Otherwise, your selection is
                saved as self-reported. You can update it in Accounts.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-[22px] bg-[#f5f8fa] p-5">
                <span className="mb-2 grid size-7 place-items-center rounded-full bg-white text-xs font-semibold text-[#00A8EF]">
                  1
                </span>
                <h3 className="text-base font-semibold tracking-tight">
                  Join the Mogging project
                </h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Open the invitation using {creatorAccountLabel(account)} in
                  TikTok and accept the project if you want to use app anchors.
                </p>
                <div className="mx-auto mt-5 w-[252px] max-w-full rounded-[20px] bg-white p-3 shadow-[0_2px_14px_rgba(0,0,0,0.035)]">
                  <Image
                    src="/creator-guide/tiktok-anchor-qr.svg"
                    alt="Scan in TikTok to join the Mogging project"
                    width={228}
                    height={228}
                    unoptimized
                    className="h-auto w-full"
                  />
                  <p className="pb-1 text-center text-[11px] text-zinc-400">
                    Scan with TikTok
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  <Button asChild className="rounded-full px-4">
                    <a
                      href={TIKTOK_ANCHOR_INVITE}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open in TikTok
                      <ArrowUpRight className="size-4" />
                    </a>
                  </Button>
                  <button
                    type="button"
                    onClick={() => void copyInvite()}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-zinc-600"
                  >
                    <Copy className="size-3.5" />
                    Copy link
                  </button>
                </div>
              </section>
              <section>
                <div className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#eaf7fd] text-xs font-semibold text-[#00A8EF]">
                    2
                  </span>
                  <h3 className="text-base font-semibold tracking-tight">
                    Choose the anchor for your video
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  On TikTok’s posting screen, open More options if needed, then
                  follow:
                </p>
                <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    'Content disclosure',
                    'Disclose post content',
                    'Branded content',
                    'Link project → Mogging',
                  ].map((step, i) => (
                    <li
                      key={step}
                      className="flex items-center gap-2.5 rounded-xl border border-zinc-100 px-3 py-2.5 text-[13px]"
                    >
                      <span className="text-[11px] tabular-nums text-zinc-400">
                        0{i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 text-xs leading-5 text-zinc-400">
                  Select the project only for videos you want to publish with an anchor.
                  App anchors are available to eligible TikTok accounts with 1,000+
                  followers, not Instagram. TikTok may also apply region, age,
                  and account eligibility checks.{' '}
                  <a
                    href={discordContactUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    Need help?
                  </a>
                </p>
              </section>
              <section className="rounded-xl border border-zinc-100 p-4">
                <h3 className="text-sm font-semibold">Review before publishing</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">TikTok checks your video before it can go live. After TikTok’s review, we approve videos within 24 hours. Posting through this project is not instant; TikTok’s review time is separate from ours.</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">Prefer to post directly? Skip the anchor. Your participation and payout eligibility stay the same.</p>
              </section>
              <label className="flex items-start gap-3 rounded-xl bg-zinc-50 p-3 text-sm leading-5 text-zinc-600">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-0.5 size-4 shrink-0 accent-[#00A8EF]"
                />
                I’ve accepted the Mogging project in TikTok using this account.
              </label>
            </>
          )}
        </div>
        <div className="shrink-0 border-t border-zinc-100 px-6 py-4 sm:px-8">
          {error ? (
            <p role="alert" className="mb-3 text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => onOpenChange(false)}
              className="min-h-11 text-sm text-zinc-500"
            >
              Maybe later
            </button>
            <Button
              disabled={busy || (followers ? !range : !confirmed)}
              onClick={() => void save()}
              className="rounded-full px-5"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {followers ? (
                'Save follower range'
              ) : (
                <>
                  I’ve joined
                  <Check className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function TikTokAnchorOnboarding({ enabled }: { enabled: boolean }) {
  const { data, mutate } = useSWR<CreatorDashboard>('/api/creator', apiGet)
  const [dismissed, setDismissed] = useState<string[] | null>(null)
  const candidates = (data?.socialAccounts || []).filter(
    (account) =>
      account.platform === 'tiktok' &&
      tiktokAnchorEligible(account) === true && !account.tiktokAnchorJoinedAt
  )
  const key = candidates
    .map(
      (account) =>
        `${account.id}:anchor`
    )
    .join(',')
  useEffect(() => {
    setDismissed(
      key.split(',').filter((id) => {
        try {
          return (
            sessionStorage.getItem(`mogging:tiktok-anchor:optional:v1:${id}`) === 'later'
          )
        } catch {
          return false
        }
      })
    )
  }, [key])
  if (!enabled || !dismissed || data?.profile?.authStatus === 'suspended')
    return null
  const account = candidates.find(
    (item) =>
      !dismissed.includes(
        `${item.id}:anchor`
      )
  )
  if (!account) return null
  const id = `${account.id}:anchor`
  return (
    <TikTokAccountDialog
      key={id}
      account={account}
      mode="anchor"
      open
      onSaved={() => mutate()}
      onOpenChange={(open) => {
        if (!open) {
          try {
            sessionStorage.setItem(`mogging:tiktok-anchor:optional:v1:${id}`, 'later')
          } catch {
            /* A browser may disable session storage. */
          }
          setDismissed((items) => [...(items || []), id])
        }
      }}
    />
  )
}
