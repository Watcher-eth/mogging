import { useState, type ReactElement } from 'react'
import dynamic from 'next/dynamic'
import { MessageCircle } from 'lucide-react'
import { Drawer } from 'vaul'
import { SUPPORT_NAME, SUPPORT_DESCRIPTION } from '@/lib/creator/support/identity'
import styles from './support-chat.module.css'
import floatingStyles from '../floating-actions.module.css'
const Chat = dynamic(() => import('./support-chat').then(m => m.CreatorSupportChat), { loading: () => <p className="p-4 text-xs text-zinc-500">Opening Mogging Support…</p> })

export function CreatorSupportLauncher({ demo = false, children }: { demo?: boolean; children?: ReactElement }) {
  const [open, setOpen] = useState(false)
  return <Drawer.Root open={open} onOpenChange={setOpen} direction="right" handleOnly autoFocus repositionInputs={false}>
    <Drawer.Trigger asChild>{children ?? <button type="button" className={`${floatingStyles.pill} ${styles.launcher}`} aria-label={`Open ${SUPPORT_NAME}`}><MessageCircle size={18} strokeWidth={1.6} /><span>{SUPPORT_NAME}</span></button>}</Drawer.Trigger>
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
