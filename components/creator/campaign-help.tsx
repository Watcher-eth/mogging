import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { HelpCircle, MessageCircle, X } from 'lucide-react'
import Image from 'next/image'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { discordContactUrl } from './content-guidelines'

export function CampaignHelp() {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const id = useId()
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 32 }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <LayoutGroup id={id}>
        <Dialog.Trigger asChild>
          <motion.button
            layoutId={reduceMotion ? undefined : 'help-panel'}
            transition={transition}
            style={{ borderRadius: 999 }}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 bg-[#f5f6f7] px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-200/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF]"
          >
            <HelpCircle className="size-3.5" />
            <motion.span layoutId={reduceMotion ? undefined : 'help-label'} layout="position" transition={transition}>Need help?</motion.span>
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
                  layoutId={reduceMotion ? undefined : 'help-panel'}
                  transition={transition}
                  style={{ borderRadius: 24 }}
                  className="fixed left-[max(16px,calc(50vw-180px))] top-[max(16px,calc(50dvh-180px))] z-50 w-[min(360px,calc(100vw-32px))] overflow-hidden border border-[#eceef0] bg-white p-6 shadow-[0_8px_40px_rgba(0,0,0,0.10)] outline-none"
                >
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }}>
                    <Dialog.Title asChild>
                      <motion.h2 layoutId={reduceMotion ? undefined : 'help-label'} layout="position" transition={transition} className="text-sm font-medium text-zinc-600">Need help?</motion.h2>
                    </Dialog.Title>
                    <Dialog.Close aria-label="Close help" className="absolute right-3 top-3 grid size-10 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF]">
                      <X className="size-4" />
                    </Dialog.Close>
                    <div className="mb-6 mt-7 text-center">
                      <Image src="/favicon.png" alt="Mogging" width={72} height={72} className="mx-auto mb-4 rounded-full" />
                      <p className="text-xl font-semibold tracking-tight">mogging.mvp</p>
                      <p className="mt-1 text-sm text-zinc-500">@mvpmogs</p>
                      <Dialog.Description className="mt-4 text-sm leading-6 text-zinc-500">Questions about a campaign? Message us on Discord.</Dialog.Description>
                    </div>
                    <Button asChild className="w-full rounded-full">
                      <a href={discordContactUrl} target="_blank" rel="noreferrer">
                        <MessageCircle className="size-4" />
                        Message
                      </a>
                    </Button>
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
