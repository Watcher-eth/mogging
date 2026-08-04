import Image from 'next/image'
import { cn } from '@/lib/utils'

export type SocialPlatform = 'instagram' | 'tiktok'

export const socialPlatformLogoUrls: Record<SocialPlatform, string> = {
  instagram: 'https://upload.wikimedia.org/wikipedia/commons/9/95/Instagram_logo_2022.svg',
  tiktok: 'https://img.magnific.com/premium-vector/tik-tok-logo_578229-290.jpg?semt=ais_test_b&w=740&q=80',
}

export function SocialPlatformLogo({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return (
    <Image
      src={socialPlatformLogoUrls[platform]}
      alt=""
      aria-hidden="true"
      width={24}
      height={24}
      sizes="24px"
      className={cn('size-6 shrink-0 object-contain', platform === 'tiktok' && 'rounded-[5px]', className)}
    />
  )
}
