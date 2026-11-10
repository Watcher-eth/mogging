import { useState } from 'react'
import { SkeletonAvatar } from '@/components/ui/skeleton-avatar'
import { ArrowUpRight, Check, Copy } from '@/components/ui/mogging-glyphs'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { CreatorIcon } from './creator-icon'

export function AccountLink({ url, accountName, avatarUrl, emptyMessage = 'Link unavailable', className }: { url: string | null | undefined; accountName?: string; avatarUrl?: string | null; emptyMessage?: string; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Link copied')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy the link')
    }
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-3 rounded-[14px] bg-[#f7f8f9] px-3 py-2.5', className)}>
      <SkeletonAvatar src={avatarUrl} alt={accountName ? `${accountName} profile photo` : 'Account profile photo'} size={32} className="size-8 rounded-[10px] bg-white text-[#00A8EF] shadow-sm" fallback={<span className="grid size-full place-items-center"><CreatorIcon name="link" className="size-6" /></span>} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold text-zinc-400">{accountName || 'Creator Link'}</p>
        {url ? <a href={url} target="_blank" rel="noreferrer" className="creator-button mt-0.5 flex w-fit max-w-full items-center gap-1 truncate text-xs font-medium text-[#00A8EF]"><span className="truncate">{url}</span><ArrowUpRight className="size-3.5 shrink-0" /></a> : <p className="mt-0.5 text-xs text-[#73777d]">{emptyMessage}</p>}
      </div>
      {url ? <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 rounded-lg bg-white px-2.5 text-xs" onClick={() => void copyLink()}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</Button> : null}
    </div>
  )
}
