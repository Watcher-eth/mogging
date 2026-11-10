import { MoggingIcon } from '@/components/ui/mogging-icon'
import type { MoggingIconName } from '@/lib/design/mogging-icons'
import { cn } from '@/lib/utils'

const creatorIcons = {
  accounts: 'people',
  campaign: 'campaign',
  conversions: 'progress',
  cta: 'scan',
  formats: 'layers',
  guide: 'courses',
  link: 'link',
  lock: 'privacy',
  overview: 'overview',
  payouts: 'wallet',
  submissions: 'submissions',
  'video-submissions': 'video',
} as const satisfies Record<string, MoggingIconName>

export type CreatorIconName = keyof typeof creatorIcons

export function CreatorIcon({ name, className }: { name: CreatorIconName; className?: string }) {
  return <MoggingIcon name={creatorIcons[name]} className={cn('creator-icon shrink-0', className)} />
}

export function CreatorStatusIcon({ name, verified }: { name: CreatorIconName; verified: boolean }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <CreatorIcon name={name} className="size-9" />
      {verified ? <MoggingIcon name="verified" size={18} className="absolute bottom-0 right-0 rounded-full bg-[#007bb0] text-white" /> : null}
    </span>
  )
}
