import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Info, X } from 'lucide-react'
import { useId, useState } from 'react'
import { CREATOR_AUDIENCE_BANDS } from '@/lib/creator/sprint-defaults'
import { CREATOR_TIER_ONE_COUNTRIES } from '@/lib/creator/audience'

export function CampaignRegionHelp() {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const id = useId()
  const transition = reduceMotion ? { duration: 0 } : { type: 'spring' as const, stiffness: 340, damping: 32 }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <LayoutGroup id={id}>
        <Dialog.Trigger asChild>
          <motion.button
            type="button"
            aria-label="Explain region rates"
            layoutId={reduceMotion ? undefined : 'region-panel'}
            transition={transition}
            style={{ borderRadius: 999 }}
            className="grid size-9 shrink-0 place-items-center text-zinc-500 hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF]"
          >
            <Info aria-hidden="true" className="size-4" />
          </motion.button>
        </Dialog.Trigger>
        <Dialog.Portal forceMount>
          <AnimatePresence>
            {open ? <>
              <Dialog.Overlay asChild forceMount>
                <motion.div className="fixed inset-0 z-50 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} />
              </Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.section
                  data-creator-controls
                  layoutId={reduceMotion ? undefined : 'region-panel'}
                  transition={transition}
                  style={{ borderRadius: 24 }}
                  className="fixed left-[max(16px,calc(50vw-210px))] top-[max(16px,calc(50dvh-280px))] z-50 max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] overflow-y-auto border border-[#eceef0] bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] outline-none"
                >
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }}>
                    <Dialog.Title className="pr-8 text-lg font-semibold tracking-tight">Region rates</Dialog.Title>
                    <Dialog.Close aria-label="Close region rates" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF]">
                      <X aria-hidden="true" className="size-4" />
                    </Dialog.Close>
                    <Dialog.Description className="mt-2 text-sm leading-6 text-zinc-500">Combine your audience share from the Tier 1 countries below to find your payout tier.</Dialog.Description>
                    <div className="my-5 space-y-4">
                      {[...CREATOR_AUDIENCE_BANDS].reverse().map((band) => (
                        <div key={band.tier}>
                          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                            <span className="font-semibold">Tier {band.tier} <span className="font-normal text-zinc-500">· {band.payoutPercent}% payout</span></span>
                            <span className="tabular-nums text-zinc-500">{band.tier === 'D' ? 'Below 15%' : `${band.minimumPercent}%+`} Tier 1</span>
                          </div>
                          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full rounded-full bg-[#00A8EF]" style={{ width: `${band.minimumPercent}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="border-t border-zinc-100 pt-4">
                      <h3 className="text-xs font-semibold">Tier 1 countries</h3>
                      <p className="mt-2 text-xs leading-6 text-zinc-500">{CREATOR_TIER_ONE_COUNTRIES.join(' · ')}</p>
                    </div>
                  </motion.div>
                </motion.section>
              </Dialog.Content>
            </> : null}
          </AnimatePresence>
        </Dialog.Portal>
      </LayoutGroup>
    </Dialog.Root>
  )
}
