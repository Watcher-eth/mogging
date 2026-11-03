import { useState, type HTMLAttributeReferrerPolicy, type ReactNode } from 'react'
import { SkeletonImage } from './skeleton-image'
import { cn } from '@/lib/utils'

export function SkeletonAvatar({ src, alt, size, fallback, className, referrerPolicy, unoptimized = true }: {
  src?: string | null
  alt: string
  size: number
  fallback: ReactNode
  className?: string
  referrerPolicy?: HTMLAttributeReferrerPolicy
  unoptimized?: boolean
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null)

  return (
    <span className={cn('relative grid shrink-0 place-items-center overflow-hidden', className)}>
      {src && src !== failedSource
        ? <SkeletonImage src={src} alt={alt} sizes={`${size}px`} className="object-cover" unoptimized={unoptimized} referrerPolicy={referrerPolicy} onError={() => setFailedSource(src)} />
        : fallback}
    </span>
  )
}
