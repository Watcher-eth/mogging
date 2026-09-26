import Image from 'next/image'
import { cn } from '@/lib/utils'

const creatorIconSources = {
  accounts: '/creator-icons/accounts.png',
  cta: '/creator-icons/cta.png',
  formats: '/creator-icons/formats.png',
  guide: '/creator-icons/guide.png',
  lock: '/creator-icons/lock.png',
  payouts: '/creator-icons/payouts.png',
  submissions: '/creator-icons/submissions.png',
  'video-submissions': '/creator-icons/video-submissions.png',
} as const

export type CreatorIconName = keyof typeof creatorIconSources

export function CreatorIcon({ name, className }: { name: CreatorIconName; className?: string }) {
  return (
    <Image
      src={creatorIconSources[name]}
      alt=""
      width={1254}
      height={1254}
      sizes="80px"
      className={cn('shrink-0 object-contain', className)}
      aria-hidden="true"
      draggable={false}
    />
  )
}
