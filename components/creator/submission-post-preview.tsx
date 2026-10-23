import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Film } from 'lucide-react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import { SocialPlatformLogo } from '@/components/brand/social-platform-logo'
import type { CreatorPostPreview } from '@/lib/creator/post-preview'
import type { CreatorSubmission } from './types'

export function useSubmissionPostPreview<Element extends HTMLElement = HTMLButtonElement>(submission: Pick<CreatorSubmission, 'id' | 'postUrl'>) {
  const ref = useRef<Element>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '160px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const { data } = useSWR<CreatorPostPreview>(visible && submission.postUrl ? `/api/creator/submissions/${submission.id}/preview` : null, apiGet, { dedupingInterval: 300_000, refreshInterval: 300_000, errorRetryCount: 0 })
  return { ref, preview: data, visible }
}

export function SubmissionPostPreview({ preview, videoUrl, platform }: { preview?: CreatorPostPreview; videoUrl?: string | null; platform: string }) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const source = preview?.thumbnailUrl
  const platformName = platform.toLowerCase()
  const socialPlatform = platformName.startsWith('instagram') ? 'instagram' : platformName === 'tiktok' ? 'tiktok' : null
  return (
    <span className="relative block aspect-[9/16] w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-950 sm:w-24" aria-hidden="true">
      {source && failedSource !== source ? (
        <Image src={source} alt="" fill sizes="96px" unoptimized className="object-contain" referrerPolicy="no-referrer" onError={() => setFailedSource(source)} />
      ) : videoUrl ? (
        <video src={videoUrl} muted playsInline preload="metadata" className="size-full object-contain" />
      ) : (
        <span className="flex size-full flex-col items-center justify-center gap-1.5 px-1 text-zinc-400"><Film className="size-5" /><span className="text-center text-[9px] leading-3">{preview ? 'No preview' : 'Video'}</span></span>
      )}
      {socialPlatform ? <span className="absolute left-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-white shadow-sm"><SocialPlatformLogo platform={socialPlatform} className="size-4" /></span> : null}
    </span>
  )
}
