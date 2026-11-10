import { useId, useState, type ReactElement } from 'react'
import dynamic from 'next/dynamic'
import * as Dialog from '@radix-ui/react-dialog'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { MessageCircle } from '@/components/ui/mogging-glyphs'
import { Drawer } from 'vaul'
import { useIsMobile } from '@/hooks/use-mobile'
import { SUPPORT_NAME, SUPPORT_DESCRIPTION } from '@/lib/creator/support/identity'
import styles from './support-chat.module.css'
import floatingStyles from '../floating-actions.module.css'
const Chat = dynamic(() => import('./support-chat').then(m => m.CreatorSupportChat), { loading: () => <p className="p-4 text-xs text-zinc-500">Opening Mogging Support…</p> })

export function CreatorSupportLauncher({ demo = false, children }: { demo?: boolean; children?: ReactElement }) {
  const [open, setOpen] = useState(false)
  const mobile = useIsMobile()
  const reduced = useReducedMotion()
  const id = useId()
  const transition = reduced ? { duration: 0 } : { type: 'spring' as const, stiffness: 340, damping: 32 }
  const pill = <motion.button type="button" layoutId={mobile && !reduced ? 'support-panel' : undefined} transition={transition} style={{ borderRadius: 24 }} className={`${floatingStyles.pill} ${styles.launcher}`} aria-label={`Open ${SUPPORT_NAME}`}><MessageCircle size={18} strokeWidth={1.6} /><span>{SUPPORT_NAME}</span></motion.button>

  if (mobile) return <Dialog.Root open={open} onOpenChange={setOpen}>
    <LayoutGroup id={id}>
      <Dialog.Trigger asChild>{children ?? pill}</Dialog.Trigger>
      <Dialog.Portal forceMount>
        <AnimatePresence>
          {open ? <>
            <Dialog.Overlay asChild forceMount><motion.div className={styles.backdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .14 }} /></Dialog.Overlay>
            <Dialog.Content asChild forceMount>
              <motion.section data-creator-controls layoutId={reduced ? undefined : 'support-panel'} transition={transition} style={{ borderRadius: 28 }} className={`creator-portal ${styles.supportMobile}`}>
                <Dialog.Title className="sr-only">{SUPPORT_NAME}</Dialog.Title>
                <Dialog.Description className="sr-only">{SUPPORT_DESCRIPTION}</Dialog.Description>
                <motion.div className={styles.drawerBody} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .14 }}><Chat demo={demo} compact onClose={() => setOpen(false)} /></motion.div>
              </motion.section>
            </Dialog.Content>
          </> : null}
        </AnimatePresence>
      </Dialog.Portal>
    </LayoutGroup>
  </Dialog.Root>

  return <Drawer.Root open={open} onOpenChange={setOpen} direction="right" handleOnly autoFocus repositionInputs={false}>
    <Drawer.Trigger asChild>{children ?? pill}</Drawer.Trigger>
    <Drawer.Portal>
      <Drawer.Overlay className={styles.backdrop} />
      <Drawer.Content className={`creator-portal ${styles.supportDrawer}`}>
        <Drawer.Title className="sr-only">{SUPPORT_NAME}</Drawer.Title>
        <Drawer.Description className="sr-only">{SUPPORT_DESCRIPTION}</Drawer.Description>
        <Drawer.Handle className={styles.drawerHandle} aria-label="Drag to close Mogging Support" />
        <div className={styles.drawerBody} data-vaul-no-drag><Chat demo={demo} compact onClose={() => setOpen(false)} /></div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
}
