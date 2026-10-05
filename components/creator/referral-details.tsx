import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { referralCode } from '@/lib/creator/sprints'
import type { CreatorSocialAccount } from './types'

export function CreatorReferralDetails({
  trackingLink,
}: Pick<CreatorSocialAccount, 'trackingLink'>) {
  if (!trackingLink) {
    return <p className="rounded-xl bg-[#f5f6f7] p-4 text-sm text-zinc-500">Connect a publishing profile with its @handle to get your referral link and code.</p>
  }
  const code = referralCode(trackingLink)
  const items = [
    { label: 'Referral code', value: code },
    { label: 'Referral link', value: trackingLink.publicUrl },
    { label: 'Bio text', value: code ? `Use ${code} for 10% on mogging.com` : undefined },
  ]

  return (
    <div className="min-w-0 divide-y divide-zinc-200 rounded-xl bg-[#f5f6f7] px-4">
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">{label}</p>
            {label === "Bio text" ? <p className="mb-1 text-xs text-zinc-500">If you put your code in your bio, use:</p> : null}
            <span className="select-text break-words text-sm">
              {value || 'Unavailable'}
            </span>
          </div>
          <button
            type="button"
            aria-label={`Copy ${label.toLowerCase()}`}
            disabled={!trackingLink?.isActive || !value}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-sm text-[#00A8EF] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00A8EF] disabled:opacity-40"
            onClick={async () => {
              if (!value) return
              try {
                await navigator.clipboard.writeText(value)
                toast.success(`${label} copied`)
              } catch {
                toast.error(`Select and copy your ${label.toLowerCase()}`)
              }
            }}
          >
            <Copy className="size-4" />
            Copy
          </button>
        </div>
      ))}
    </div>
  )
}
