import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { MessageCircle, X } from 'lucide-react'
import { useId, useState } from 'react'
import { SidebarMenuButton } from '@/components/ui/sidebar'

export function DiscordSupport() {
  const [open, setOpen] = useState(false)
  const reduceMotion = useReducedMotion()
  const motionId = useId()
  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 340, damping: 32 }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <LayoutGroup id={motionId}>
        <SidebarMenuButton asChild tooltip="Discord Support" className="creator-discord-support">
          <Dialog.Trigger asChild>
            <motion.button layoutId={reduceMotion ? undefined : 'discord-panel'} transition={transition} style={{ borderRadius: 999 }} aria-label="Discord Support">
              <MessageCircle className="size-4" />
              <motion.span layoutId={reduceMotion ? undefined : 'discord-label'} layout="position" transition={transition}>Discord Support</motion.span>
            </motion.button>
          </Dialog.Trigger>
        </SidebarMenuButton>
        <Dialog.Portal forceMount>
          <AnimatePresence>
            {open ? (
              <>
                <Dialog.Overlay asChild forceMount>
                  <motion.div className="fixed inset-0 z-50 bg-black/20" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }} />
                </Dialog.Overlay>
                <Dialog.Content asChild forceMount>
                  <motion.section
                    data-creator-controls
                    layoutId={reduceMotion ? undefined : 'discord-panel'}
                    transition={transition}
                    style={{ borderRadius: 20 }}
                    className="fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-4 z-50 w-[min(350px,calc(100vw-32px))] overflow-hidden border border-[#eceef0] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.10)] outline-none sm:bottom-6 sm:left-6"
                  >
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.14 }}>
                      <header className="relative px-5 pb-4 pt-5 pr-16">
                        <Dialog.Title asChild>
                          <motion.h2 layoutId={reduceMotion ? undefined : 'discord-label'} layout="position" transition={transition} className="text-sm font-semibold">Discord Support</motion.h2>
                        </Dialog.Title>
                        <Dialog.Description className="mt-1 text-xs leading-5 text-zinc-500">Join our creator community for feedback and help.</Dialog.Description>
                        <Dialog.Close aria-label="Close Discord Support" className="absolute right-2 top-2 grid size-11 place-items-center rounded-full text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00A8EF]">
                          <span className="grid size-8 place-items-center rounded-full hover:bg-zinc-100"><X className="size-4" /></span>
                        </Dialog.Close>
                      </header>
                      <iframe
                        src="https://discord.com/widget?id=1526698974847963268&theme=dark"
                        title="Mogging creator Discord server"
                        width="350"
                        height="500"
                        className="block h-[min(500px,calc(100dvh-150px))] w-full border-0 bg-[#1e1f22]"
                        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                      />
                    </motion.div>
                  </motion.section>
                </Dialog.Content>
              </>
            ) : null}
          </AnimatePresence>
        </Dialog.Portal>
      </LayoutGroup>
    </Dialog.Root>
  )
}
