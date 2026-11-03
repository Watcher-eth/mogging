import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function CreatorHeader({ eyebrow, title, description, action, titleAccessory, eyebrowAccessory }: { eyebrow: string; title: string; description: string; action?: ReactNode; titleAccessory?: ReactNode; eyebrowAccessory?: ReactNode }) {
  return (
    <header className="creator-page-header">
      <div className={cn("min-w-0", (titleAccessory || eyebrowAccessory) && "flex-1")}>
        <div className={cn("items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.13em] text-[#858a91]", eyebrowAccessory ? "flex" : "hidden sm:flex")}><span>{eyebrow}</span>{eyebrowAccessory}</div>
        <div className="mt-2 flex items-center justify-between gap-3"><h1 className="text-[1.75rem] font-medium leading-[1.15] tracking-[-0.035em] text-[#181a1d] sm:text-[2.25rem]">{title}</h1>{titleAccessory}</div>
        <p className="mt-0.5 max-w-2xl text-sm leading-5 sm:text-[15px] sm:leading-6 text-[#73777d]">{description}</p>
      </div>
      {action ? <div className="creator-header-action">{action}</div> : null}
    </header>
  )
}
