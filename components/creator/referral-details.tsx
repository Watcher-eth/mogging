import { Copy } from 'lucide-react'
import { toast } from 'sonner'
import { referralCode } from '@/lib/creator/sprints'
import type { CreatorSocialAccount } from './types'

type ReferralProps = Pick<CreatorSocialAccount, 'trackingLink'>

async function copyReferral(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(`${label} copied`)
  } catch {
    toast.error(`Select and copy your ${label.toLowerCase()}`)
  }
}

export function CreatorReferralCode({ trackingLink }: ReferralProps) {
  const code = trackingLink ? referralCode(trackingLink) : undefined
  if (!code) return null
  return (
    <button
      type="button"
      aria-label={`Copy referral code ${code}`}
      title={code}
      disabled={!trackingLink?.isActive}
      onClick={() => void copyReferral(code, 'Referral code')}
      className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-3 text-sm hover:border-[#00A8EF] hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00A8EF] disabled:opacity-40"
    >
      <span className="truncate">{code}</span>
      <Copy aria-hidden="true" className="size-3.5 shrink-0 text-[#00A8EF]" />
    </button>
  )
}

export function CreatorReferralDetails({ trackingLink }: ReferralProps) {
  if (!trackingLink) {
    return <p className="text-sm text-zinc-500">Connect a publishing profile with its @handle to get your referral link and code.</p>
  }
  const code = referralCode(trackingLink)
  const items = [
    { label: 'Referral link', value: trackingLink.publicUrl },
    { label: 'Copy for your bio', value: code ? `Use ${code} for 10% on mogging.com` : undefined },
  ]

  return (
    <div className="min-w-0 divide-y divide-zinc-100">
      <p className="py-3 text-xs leading-5 text-zinc-500">Your code gives new subscribers 10% off their first month. Include it in post captions; adding it to your bio is optional.</p>
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="mb-1 text-xs text-zinc-500">{label}</p>
            <span className="select-text break-words text-sm leading-6">{value || 'Unavailable'}</span>
          </div>
          <button
            type="button"
            aria-label={`Copy ${label === 'Copy for your bio' ? 'bio text' : 'referral link'}`}
            title={`Copy ${label === 'Copy for your bio' ? 'bio text' : 'referral link'}`}
            disabled={!trackingLink.isActive || !value}
            className="grid size-11 shrink-0 place-items-center rounded-full text-[#00A8EF] hover:bg-sky-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00A8EF] disabled:opacity-40"
            onClick={() => { if (value) void copyReferral(value, label === 'Copy for your bio' ? 'Bio text' : label) }}
          >
            <Copy aria-hidden="true" className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
