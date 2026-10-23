import { forwardRef, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { AnimatePresence, motion, useAnimationControls, useIsPresent, useReducedMotion, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'

const dialogTransition = { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const }
const resting = { opacity: 1, transform: 'translate3d(0,0,0)', filter: 'blur(0px)' }
const swish: Variants = {
  enter: (direction: number) => ({ opacity: 0, transform: `translate3d(${direction * 22}px,0,0)`, filter: 'blur(6px)' }),
  visible: { ...resting, transition: { ...dialogTransition, duration: 0.24 } },
  exit: (direction: number) => ({ opacity: 0, transform: `translate3d(${direction * -16}px,0,0)`, filter: 'blur(5px)', transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }),
}
const still: Variants = { visible: { ...resting, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0 } } }

// Exiting fields remain visible briefly, but cannot receive focus or block validation.
const PanelContent = forwardRef<HTMLDivElement, ComponentProps<typeof motion.div>>((props, ref) => {
  const present = useIsPresent()
  return <motion.div {...props} ref={ref} inert={!present || undefined} aria-hidden={!present || undefined} />
})
PanelContent.displayName = 'DialogPanelContent'

// Measure the active content independently of the animated frame and outgoing step.
// The default transition preserves child identity, including unsaved drafts.
export function AnimatedDialogPanel({ children, contentKey, className, contentClassName, motionStyle = 'fade', direction = 1 }: {
  children: ReactNode
  contentKey: string | number
  className?: string
  contentClassName?: string
  motionStyle?: 'fade' | 'swish'
  direction?: 1 | -1
}) {
  const content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  const reduced = useReducedMotion()
  const animation = useAnimationControls()
  const switching = motionStyle === 'swish'

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
    if (switching) return
    if (reduced) {
      animation.set({ opacity: 1, y: 0 })
      return
    }
    animation.set({ opacity: 0, y: 6 })
    void animation.start({ opacity: 1, y: 0, transition: dialogTransition })
    return () => animation.stop()
  }, [contentKey, reduced, animation, switching])

  return <motion.div initial={false} animate={{ height: height ?? 'auto' }} transition={reduced ? { duration: 0 } : dialogTransition} className={cn('relative min-w-0 overflow-hidden', className)}>
    <div ref={content} className="relative flow-root min-w-0">
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <PanelContent key={switching ? contentKey : 'content'} custom={direction} variants={switching ? reduced ? still : swish : undefined} initial={switching && !reduced ? 'enter' : false} animate={switching ? 'visible' : animation} exit={switching ? 'exit' : undefined} className={cn('flow-root min-w-0', contentClassName)}>{children}</PanelContent>
      </AnimatePresence>
    </div>
  </motion.div>
}
