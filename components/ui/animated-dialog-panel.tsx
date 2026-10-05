import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useAnimationControls, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/utils'

const dialogTransition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }

// Measure the natural content, keeping the animated frame independent of it.
// Children retain their identity when a selector changes, including unsaved drafts.
export function AnimatedDialogPanel({ children, contentKey, className, contentClassName }: {
  children: ReactNode
  contentKey: string | number
  className?: string
  contentClassName?: string
}) {
  const content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  const reduced = useReducedMotion()
  const animation = useAnimationControls()

  useLayoutEffect(() => {
    const element = content.current
    if (!element) return
    setHeight(element.offsetHeight)
    const observer = new ResizeObserver(([entry]) => {
      setHeight(entry.borderBoxSize[0]?.blockSize ?? element.offsetHeight)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (reduced) {
      animation.set({ opacity: 1, y: 0 })
      return
    }
    animation.set({ opacity: 0, y: 6 })
    void animation.start({ opacity: 1, y: 0, transition: dialogTransition })
    return () => animation.stop()
  }, [contentKey, reduced, animation])

  return <motion.div initial={false} animate={{ height: height ?? 'auto' }} transition={reduced ? { duration: 0 } : dialogTransition} className={cn('relative min-w-0 overflow-hidden', className)}>
    <motion.div ref={content} initial={false} animate={animation} className={cn('flow-root min-w-0', contentClassName)}>{children}</motion.div>
  </motion.div>
}
