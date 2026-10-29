'use client'

import { createContext, useContext, useId, type ComponentProps, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

type DisclosureState = { open: boolean; onOpenChange: (open: boolean) => void; id: string }
const DisclosureContext = createContext<DisclosureState | null>(null)

function useDisclosure() {
  const context = useContext(DisclosureContext)
  if (!context) throw new Error('Disclosure components require Disclosure')
  return context
}

export function Disclosure({ open, onOpenChange, children, ...props }: ComponentProps<'div'> & {
  open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode
}) {
  const id = useId()
  return <DisclosureContext.Provider value={{ open, onOpenChange, id }}><div {...props}>{children}</div></DisclosureContext.Provider>
}

export function DisclosureTrigger({ children, onClick, ...props }: ComponentProps<'button'>) {
  const { open, onOpenChange, id } = useDisclosure()
  return <button {...props} type="button" aria-expanded={open} aria-controls={id} onClick={event => {
    onClick?.(event)
    if (!event.defaultPrevented) onOpenChange(!open)
  }}>{children}</button>
}

export function DisclosureContent({ children, className }: { children: ReactNode; className?: string }) {
  const { open, id } = useDisclosure()
  const reduced = useReducedMotion()
  return <div className={className} inert={!open} aria-hidden={!open}><AnimatePresence initial={false}>
    {open ? <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 220, damping: 30, mass: .8 }} style={{ overflow: 'hidden' }}>
      {children}
    </motion.div> : null}
  </AnimatePresence></div>
}
