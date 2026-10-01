import { BadgeCheck, BookOpen, Files, Layers, LayoutDashboard, Link2, ScanFace, ShieldCheck, UsersRound, Video, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'

const creatorIcons = {
  accounts: UsersRound,
  cta: ScanFace,
  formats: Layers,
  guide: BookOpen,
  link: Link2,
  lock: ShieldCheck,
  overview: LayoutDashboard,
  payouts: Wallet,
  submissions: Files,
  'video-submissions': Video,
} as const

export type CreatorIconName = keyof typeof creatorIcons

export function CreatorIcon({ name, className }: { name: CreatorIconName; className?: string }) {
  const Icon = creatorIcons[name]
  return <Icon className={cn('creator-icon shrink-0', className)} strokeWidth={1.6} aria-hidden="true" />
}

export function CreatorStatusIcon({ name, verified }: { name: CreatorIconName; verified: boolean }) {
  return (
    <span className="relative grid size-10 shrink-0 place-items-center">
      <CreatorIcon name={name} className="size-9" />
      {verified ? <BadgeCheck className="absolute bottom-0 right-0 size-[18px] fill-[#00A8EF] text-white" aria-hidden="true" /> : null}
    </span>
  )
}
