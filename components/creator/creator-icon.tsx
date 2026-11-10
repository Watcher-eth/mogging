import { MoggingIcon } from '@/components/ui/mogging-icon'
import type { MoggingWebIconName } from '@/lib/design/mogging-web-glyphs'
import { cn } from '@/lib/utils'

const creatorIcons = {
  accounts: 'social-accounts',
  campaign: 'campaign',
  conversions: 'progress',
  cta: 'cta-card',
  studio: 'creator-studio',
  'create-content': 'post-compose',
  'improve-content': 'creative-polish',
  formats: 'layers',
  guide: 'field-guide',
  link: 'link',
  lock: 'privacy',
  overview: 'overview',
  payouts: 'wallet',
  submissions: 'submissions',
  'video-submissions': 'submitted-video',
} as const satisfies Record<string, MoggingWebIconName>

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
