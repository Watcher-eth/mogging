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
  const items = [
    { label: 'Referral code', value: referralCode(trackingLink) },
    { label: 'Referral link', value: trackingLink?.publicUrl },
  ]

  return (
    <div className="min-w-0 divide-y divide-zinc-200 rounded-xl bg-[#f5f6f7] px-4">
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="text-xs text-zinc-500">{label}</p>
            <code className="select-text break-all text-sm">
              {value || 'Unavailable'}
            </code>
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
                toast.success(`${label === 'Referral link' ? 'Link' : 'Code'} copied`)
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
