// Adapted from Prompt Kit (MIT). See LICENSE.md in this directory.
// Plain-text content keeps trusted portal artifacts separate from model output.
import type { ComponentProps } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function Message({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex gap-3', className)} {...props} />
}

export function MessageContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('min-w-0 whitespace-pre-wrap break-words', className)} {...props} />
}

export function MessageActions({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 text-muted-foreground', className)} {...props} />
}

export function MessageAction({ tooltip, children }: { tooltip: string; children: React.ReactNode }) {
  return <TooltipProvider><Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{tooltip}</TooltipContent></Tooltip></TooltipProvider>
}
