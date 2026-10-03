import { useState, type FormEvent } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import { Field, fieldClass } from './creator-shell'
import type { CreatorSocialAccount } from './types'
import { apiPost, ApiClientError } from '@/lib/api/client'
import { referralCode } from '@/lib/creator/sprints'
import { cn } from '@/lib/utils'

export function ConnectAccountForm({
  platform,
  onPlatformChange,
  disabled,
  onConnected,
  counts,
}: {
  platform: 'tiktok' | 'instagram'
  onPlatformChange: (platform: 'tiktok' | 'instagram') => void
  disabled: boolean
  onConnected: (account: CreatorSocialAccount) => Promise<void>
  counts: { tiktok: number; instagram: number }
}) {
  const [busy, setBusy] = useState(false)
  const [identity, setIdentity] = useState('')
  const [connected, setConnected] = useState<CreatorSocialAccount | null>(null)
  const [copied, setCopied] = useState(false)
  const label = platform === 'tiktok' ? 'TikTok' : 'Instagram'
  async function connect(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const { account } = await apiPost<{ account: CreatorSocialAccount }>(
        '/api/creator/accounts',
        { platform, identity },
      )
      setConnected(account)
    } catch (error) {
      toast.error(
        error instanceof ApiClientError
          ? error.message
          : 'Could not connect your account',
      )
    } finally {
      setBusy(false)
    }
  }
  if (connected) {
    const code = referralCode(connected.trackingLink)
    return (
      <div className="grid gap-5 p-6 sm:p-7">
        <div>
          <span className="mb-3 grid size-10 place-items-center rounded-full bg-[#00A8EF] text-white">
            <Check className="size-5" />
          </span>
          <h3 className="font-semibold">Your account is connected</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Share your permanent referral code in your bio, captions and pinned
            comments.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f5f6f7] p-4">
          <code className="break-all text-lg">{code}</code>
          <button
            type="button"
            aria-label="Copy referral code"
            className="flex min-h-11 shrink-0 items-center gap-2 text-sm text-[#00A8EF]"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(code || '')
                setCopied(true)
              } catch {
                toast.error('Select and copy your code')
              }
            }}
          >
            {copied ? (
              <Check className="size-4" />
            ) : (
              <Copy className="size-4" />
            )}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <Button
          onClick={async () => {
            setBusy(true)
            try {
              await onConnected(connected)
            } finally {
              setBusy(false)
            }
          }}
          disabled={busy}
        >
          Done
        </Button>
      </div>
    )
  }
  return (
    <form onSubmit={connect} className="grid gap-5 p-6 sm:p-7">
      <div className="grid grid-cols-2 gap-2">
        {(['tiktok', 'instagram'] as const).map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            onClick={() => {
              onPlatformChange(option)
              setIdentity('')
            }}
            className={cn(
              'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm capitalize',
              platform === option
                ? 'creator-choice-selected'
                : 'border-zinc-200',
            )}
          >
            <SocialPlatformLogo platform={option} className="size-5" />
            {option}
            <span className="ml-auto text-xs text-zinc-500">
              {counts[option]}/5
            </span>
          </button>
        ))}
      </div>
      <Field label={`${label} handle or URL`}>
        <input
          className={fieldClass}
          value={identity}
          onChange={(event) => setIdentity(event.target.value)}
          placeholder={
            platform === 'tiktok'
              ? '@your-handle or tiktok.com/@handle'
              : '@your-handle or instagram.com/handle'
          }
          required
          disabled={busy || disabled}
          autoComplete="off"
        />
      </Field>
      <p className="text-xs leading-5 text-zinc-500">
        Connect your publishing profile to receive your referral code.
      </p>
      {disabled ? (
        <p className="text-sm text-[#F33232]">
          You’ve reached the account limit for this platform.
        </p>
      ) : null}
      <Button disabled={busy || disabled}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? 'Connecting…' : 'Connect account'}
      </Button>
    </form>
  )
}
