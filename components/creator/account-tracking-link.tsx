import { useState } from 'react'
import { ArrowUpRight, Check, Copy, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function AccountTrackingLink({ url, className }: { url: string | null | undefined; className?: string }) {
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
    <div className={cn('flex min-w-0 items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5', className)}>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-zinc-500 shadow-sm"><Link2 className="size-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Creator Link</p>
        {url ? <a href={url} target="_blank" rel="noreferrer" className="mt-0.5 flex w-fit max-w-full items-center gap-1 truncate text-xs font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:text-black"><span className="truncate">{url}</span><ArrowUpRight className="size-3.5 shrink-0" /></a> : <p className="mt-0.5 text-xs text-zinc-500">Generating link…</p>}
      </div>
      {url ? <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 rounded-lg bg-white px-2.5 text-xs" onClick={() => void copyLink()}>{copied ? <Check /> : <Copy />}{copied ? 'Copied' : 'Copy'}</Button> : null}
    </div>
  )
}
