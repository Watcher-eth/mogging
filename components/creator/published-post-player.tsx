import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import useSWR from 'swr'
import { apiGet } from '@/lib/api/client'
import { creatorPostPlatform } from '@/lib/creator/validation'
import { publishedVideoEmbedUrl } from '@/lib/creator/post-embed'
import { cn } from '@/lib/utils'

type ResolvedPost = { canonicalUrl: string; embedUrl: string | null }
const frameClass = 'relative h-[480px] max-h-[52dvh] w-full max-w-[340px] overflow-hidden rounded-2xl bg-zinc-50'

function PlayerSkeleton() {
  return <div role="status" className="absolute inset-0 grid grid-rows-[32px_1fr_16px] gap-4 p-4">
    <span className="sr-only">Loading post preview…</span>
    <div aria-hidden="true" className="flex animate-pulse items-center gap-3 motion-reduce:animate-none"><div className="size-8 rounded-full bg-zinc-200" /><div className="h-2.5 w-24 rounded-full bg-zinc-200" /></div>
    <div aria-hidden="true" className="animate-pulse rounded-xl bg-zinc-200/70 motion-reduce:animate-none" />
    <div aria-hidden="true" className="h-2.5 w-3/5 animate-pulse rounded-full bg-zinc-200 motion-reduce:animate-none" />
  </div>
}

function NativePlayer({ src, title }: { src: string; title: string }) {
  const [ready, setReady] = useState(false)
  const reduced = useReducedMotion()
  return <div className={frameClass} aria-busy={!ready}>
    <iframe src={src} title={title} onLoad={() => setReady(true)} className={cn('absolute inset-0 size-full border-0 bg-white transition-[opacity,filter] duration-300 ease-out motion-reduce:transition-none', ready ? 'opacity-100 blur-0' : 'pointer-events-none opacity-0 blur-sm')} allow="encrypted-media; fullscreen; picture-in-picture" allowFullScreen />
    <AnimatePresence initial={false}>{!ready ? <motion.div key="skeleton" className="pointer-events-none absolute inset-0" exit={{ opacity: 0, filter: reduced ? 'none' : 'blur(4px)' }} transition={{ duration: reduced ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}><PlayerSkeleton /></motion.div> : null}</AnimatePresence>
  </div>
}

export function PublishedPostPlayer({ postUrl }: { postUrl: string }) {
  const currentUrl = postUrl.trim()
  const [url, setUrl] = useState(() => currentUrl)
  useEffect(() => {
    const timer = setTimeout(() => setUrl(currentUrl), 350)
    return () => clearTimeout(timer)
  }, [currentUrl])
  const platform = creatorPostPlatform(currentUrl)
  const direct = publishedVideoEmbedUrl(url)
  const { data, isLoading } = useSWR<ResolvedPost>(creatorPostPlatform(url) && !direct ? `/api/creator/post-embed?url=${encodeURIComponent(url)}` : null, apiGet, { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 60_000 })
  if (!platform) return null
  const pending = currentUrl !== url || isLoading
  const embed = direct || data?.embedUrl
  return <div className="grid justify-items-center gap-3">
    {pending ? <div className={frameClass} aria-busy="true"><PlayerSkeleton /></div> : embed ? <NativePlayer key={embed} src={embed} title={`${platform === 'tiktok' ? 'TikTok' : 'Instagram'} post preview`} /> : <p className="text-center text-xs leading-5 text-zinc-500">Preview unavailable for this link. Paste its full post URL or open it below.</p>}
    <a href={currentUrl === url ? data?.canonicalUrl || currentUrl : currentUrl} target="_blank" rel="noreferrer" className="text-xs text-zinc-500 underline underline-offset-4">Open original post ↗</a>
  </div>
}
