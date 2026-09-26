import { useState } from 'react'
import * as Avatar from '@radix-ui/react-avatar'
import { ArrowUpRight, Check, Copy, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AccountTrackingLink({ url, accountName, avatarUrl, className }: { url: string | null | undefined; accountName?: string; avatarUrl?: string | null; className?: string }) {
  const [copied, setCopied] = useState(false)

  async function copyLink() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('Creator link copied')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Could not copy the creator link')
    }
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-3 rounded-[14px] bg-[#f5f5f7] px-3 py-2.5', className)}>
      <Avatar.Root className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-[10px] bg-white text-[#0071e3] shadow-sm">
        <Avatar.Image src={avatarUrl || undefined} alt={accountName ? `${accountName} profile photo` : 'Account profile photo'} className="size-full object-cover" />
        <Avatar.Fallback className="grid size-full place-items-center text-xs font-semibold">{accountName ? accountName.replace(/^@/, '').charAt(0).toUpperCase() : <Link2 className="size-4" />}</Avatar.Fallback>
      </Avatar.Root>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-semibold text-zinc-400">{accountName || 'Creator Link'}</p>
        {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 flex w-fit max-w-full items-center gap-1 truncate text-xs font-medium text-[#0071e3] hover:opacity-70"><span className="truncate">{url}</span><ArrowUpRight className="size-3.5 shrink-0" /></a> : <p className="mt-0.5 text-xs text-[#6e6e73]">Generating link…</p>}
      </div>
      {url ? <Button type="button" variant="outline" size="sm" className="h-11 shrink-0 rounded-lg bg-white px-2.5 text-xs" onClick={() => void copyLink()}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</Button> : null}
    </div>
  )
}
